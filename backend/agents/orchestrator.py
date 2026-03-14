"""Pipeline orchestrator - sequences all agents and manages job state."""

from datetime import datetime
from core.job_store import Job
from core.models import PipelineStep


# Step keys that can be selected by users
SELECTABLE_STEPS = {
    "schema_mapping",
    "completeness",
    "relationships",
    "quality",
    "query_generation",
    "executing",
    "validation",
}


def _should_run(job: Job, step_key: str) -> bool:
    """Check if a step should run based on selected_steps."""
    if job.selected_steps is None:
        return True  # run all
    return step_key in job.selected_steps


async def run_pipeline_async(job: Job):
    """Run the AMMF pipeline as a background task. Respects job.selected_steps."""
    job.started_at = datetime.now().isoformat()

    # Bind LLM logger to this job (clears previous run's logs)
    from core.llm_client import llm_client
    llm_client.bind_job(job)

    try:
        # Determine which groups to run
        run_mapping = _should_run(job, "schema_mapping")
        run_completeness = _should_run(job, "completeness")
        run_relationships = _should_run(job, "relationships")
        run_quality = _should_run(job, "quality")
        run_query = _should_run(job, "query_generation")
        run_execute = _should_run(job, "executing")
        run_validation = _should_run(job, "validation")

        # If only validation is selected, user provides pre-built AMMF - skip to violations
        only_validation = (job.selected_steps is not None
                           and "validation" in job.selected_steps
                           and not run_mapping and not run_query)

        relationships = None

        # Step 1: Schema Mapping
        if run_mapping:
            job.set_step(PipelineStep.SCHEMA_MAPPING, 10)
            job.add_message("Starting schema mapping...")
            from agents.schema_mapper import run_schema_mapping
            job.schema_mapping = await run_schema_mapping(job)
            job.add_message(f"Schema mapping complete: {len(job.schema_mapping.mappings)} columns mapped")
        else:
            job.add_message("Skipping schema mapping (not selected)")

        # Step 2: Completeness Check
        if run_completeness and job.schema_mapping:
            job.set_step(PipelineStep.COMPLETENESS, 25)
            job.add_message("Checking data completeness...")
            from agents.completeness_checker import run_completeness_check
            completeness = run_completeness_check(job.schema_mapping)
            if completeness["missing_required"]:
                job.add_message(f"WARNING: Missing required fields: {completeness['missing_required']}")
            else:
                job.add_message("All required AMMF fields are mapped")
        else:
            job.add_message("Skipping completeness check")

        # Step 3: Relationship Discovery
        if run_relationships:
            job.set_step(PipelineStep.RELATIONSHIPS, 35)
            job.add_message("Discovering table relationships...")
            from agents.relationship_discoverer import run_relationship_discovery
            relationships = await run_relationship_discovery(job)
            job.add_message(f"Found {len(relationships.get('joins', []))} join relationships")
        else:
            job.add_message("Skipping relationship discovery")

        # Step 4: Data Quality
        if run_quality:
            job.set_step(PipelineStep.QUALITY, 50)
            job.add_message("Running data quality checks...")
            from agents.quality_analyzer import run_quality_analysis
            job.quality_report = run_quality_analysis(job)
            job.add_message("Data quality analysis complete")
        else:
            job.add_message("Skipping data quality analysis")

        # Step 5: Query Generation
        if run_query:
            job.set_step(PipelineStep.QUERY_GENERATION, 65)
            job.add_message("Generating transformation query...")
            from agents.query_generator import run_query_generation
            job.generated_sql = await run_query_generation(job, relationships)
            job.add_message("SQL query generated")
        else:
            job.add_message("Skipping query generation")

        # Step 6: Execute Query
        if run_execute and job.generated_sql:
            job.set_step(PipelineStep.EXECUTING, 75)
            job.add_message("Executing transformation query...")
            job.ammf_dataframe = job.db.execute(job.generated_sql)
            job.add_message(f"AMMF output generated: {len(job.ammf_dataframe)} rows")
        elif only_validation:
            # For validation-only mode, treat uploaded data as AMMF
            job.set_step(PipelineStep.EXECUTING, 75)
            job.add_message("Validation-only mode: using uploaded data as AMMF output")
            if job.tables:
                # Use the first (or largest) table as the AMMF data
                largest = max(job.tables.items(), key=lambda x: len(x[1]))
                job.ammf_dataframe = largest[1]
                job.add_message(f"Using table '{largest[0]}' ({len(largest[1])} rows) for validation")
        else:
            job.add_message("Skipping query execution")

        # Step 7: Violation Checks
        if run_validation and job.ammf_dataframe is not None:
            job.set_step(PipelineStep.VALIDATION, 85)
            job.add_message("Running violation checks...")
            from agents.violation_checker import run_violation_checks
            job.violation_report = run_violation_checks(job)
            job.add_message(f"Violation check complete: {job.violation_report.total_violations} violations found")
        else:
            job.add_message("Skipping violation checks")

        # Done
        job.set_step(PipelineStep.COMPLETE, 100)
        job.completed_at = datetime.now().isoformat()
        job.add_message("Pipeline complete!")

    except Exception as e:
        job.set_step(PipelineStep.ERROR, job.progress_pct)
        job.error = str(e)
        job.add_message(f"ERROR: {e}")
        raise
