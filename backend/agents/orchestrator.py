"""Pipeline orchestrator - sequences all agents and manages job state."""

from datetime import datetime
from core.job_store import Job
from core.models import PipelineStep


async def run_pipeline_async(job: Job):
    """Run the full AMMF pipeline as a background task."""
    job.started_at = datetime.now().isoformat()
    try:
        # Step 1: Schema Mapping
        job.set_step(PipelineStep.SCHEMA_MAPPING, 10)
        job.add_message("Starting schema mapping...")
        from agents.schema_mapper import run_schema_mapping
        job.schema_mapping = await run_schema_mapping(job)
        job.add_message(f"Schema mapping complete: {len(job.schema_mapping.mappings)} columns mapped")

        # Step 2: Completeness Check
        job.set_step(PipelineStep.COMPLETENESS, 25)
        job.add_message("Checking data completeness...")
        from agents.completeness_checker import run_completeness_check
        completeness = run_completeness_check(job.schema_mapping)
        if completeness["missing_required"]:
            job.add_message(f"WARNING: Missing required fields: {completeness['missing_required']}")
        else:
            job.add_message("All required AMMF fields are mapped")

        # Step 3: Relationship Discovery
        job.set_step(PipelineStep.RELATIONSHIPS, 35)
        job.add_message("Discovering table relationships...")
        from agents.relationship_discoverer import run_relationship_discovery
        relationships = await run_relationship_discovery(job)
        job.add_message(f"Found {len(relationships.get('joins', []))} join relationships")

        # Step 4: Data Quality
        job.set_step(PipelineStep.QUALITY, 50)
        job.add_message("Running data quality checks...")
        from agents.quality_analyzer import run_quality_analysis
        job.quality_report = run_quality_analysis(job)
        job.add_message("Data quality analysis complete")

        # Step 5: Query Generation
        job.set_step(PipelineStep.QUERY_GENERATION, 65)
        job.add_message("Generating transformation query...")
        from agents.query_generator import run_query_generation
        job.generated_sql = await run_query_generation(job, relationships)
        job.add_message("SQL query generated")

        # Step 6: Execute Query
        job.set_step(PipelineStep.EXECUTING, 75)
        job.add_message("Executing transformation query...")
        job.ammf_dataframe = job.db.execute(job.generated_sql)
        job.add_message(f"AMMF output generated: {len(job.ammf_dataframe)} rows")

        # Step 7: Violation Checks
        job.set_step(PipelineStep.VALIDATION, 85)
        job.add_message("Running violation checks...")
        from agents.violation_checker import run_violation_checks
        job.violation_report = run_violation_checks(job)
        job.add_message(f"Violation check complete: {job.violation_report.total_violations} violations found")

        # Done
        job.set_step(PipelineStep.COMPLETE, 100)
        job.completed_at = datetime.now().isoformat()
        job.add_message("Pipeline complete!")

    except Exception as e:
        job.set_step(PipelineStep.ERROR, job.progress_pct)
        job.error = str(e)
        job.add_message(f"ERROR: {e}")
        raise
