"""Web Research Agent - Performs agentic web research for merchant data remediation.

Takes a merchant name + violation context, searches the web for relevant info,
and presents findings with suggested fixes for user confirmation.
"""

import json
import re
import urllib.parse
import httpx
from core.llm_client import llm_client
from core.models import WebResearchResult

# Brave Search API (free tier: 2000 queries/month)
_BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search"


async def research_merchant(
    merchant_name: str,
    violation_context: str,
    user_objective: str = "",
    affected_columns: list[str] | None = None,
) -> WebResearchResult:
    """Research a merchant using web search + LLM analysis.

    1. Generate targeted search queries based on the violation context
    2. Execute web searches
    3. Analyze results with Claude to extract actionable fixes
    """
    # Step 1: Generate search queries
    queries = _generate_search_queries(merchant_name, violation_context, user_objective)

    # Step 2: Execute searches
    all_results = []
    for query in queries[:3]:  # Cap at 3 queries
        results = await _web_search(query)
        all_results.extend(results)

    # Step 3: Analyze with LLM
    analysis = _analyze_findings(
        merchant_name, violation_context, user_objective,
        all_results, affected_columns or [],
    )

    return WebResearchResult(
        merchant_name=merchant_name,
        query=violation_context,
        findings=all_results[:10],
        suggested_fixes=analysis.get("suggested_fixes", []),
        raw_analysis=analysis.get("analysis", ""),
        search_queries_used=queries,
    )


def _generate_search_queries(
    merchant_name: str,
    violation_context: str,
    user_objective: str,
) -> list[str]:
    """Use Claude to generate targeted search queries."""
    system = """You are a data research assistant. Generate 2-3 targeted web search queries
to find accurate business information about a merchant. Focus on official sources
like business registries, company websites, and directory listings."""

    user = f"""Merchant: {merchant_name}
Issue: {violation_context}
{"User wants: " + user_objective if user_objective else ""}

Generate search queries to find the correct information. Return as JSON:
{{"queries": ["query 1", "query 2", "query 3"]}}"""

    schema = {
        "type": "object",
        "properties": {
            "queries": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 3,
            }
        },
        "required": ["queries"],
    }

    try:
        result = llm_client.structured_query(system, user, schema, label="Research: Query Gen")
        return result.get("queries", [f'"{merchant_name}" business address'])
    except Exception:
        # Fallback to simple queries
        clean = merchant_name.strip().strip('"')
        return [
            f'"{clean}" business address location',
            f'"{clean}" company registration',
        ]


async def _web_search(query: str) -> list[dict]:
    """Execute a web search. Tries Brave Search API, falls back to
    a simple scraping approach if no API key is configured."""
    import os
    brave_key = os.environ.get("BRAVE_SEARCH_API_KEY")

    if brave_key:
        return await _brave_search(query, brave_key)
    else:
        # Fallback: use Claude's knowledge as a "search" stand-in
        return _llm_knowledge_search(query)


async def _brave_search(query: str, api_key: str) -> list[dict]:
    """Search using Brave Search API."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                _BRAVE_API_URL,
                params={"q": query, "count": 5},
                headers={"X-Subscription-Token": api_key, "Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()

            results = []
            for item in data.get("web", {}).get("results", [])[:5]:
                results.append({
                    "source": item.get("url", ""),
                    "title": item.get("title", ""),
                    "snippet": item.get("description", ""),
                    "relevance": "high",
                })
            return results
    except Exception as e:
        return [{"source": "search_error", "title": "Search failed", "snippet": str(e), "relevance": "low"}]


def _llm_knowledge_search(query: str) -> list[dict]:
    """Fallback: use Claude's training data as a knowledge source."""
    system = """You are a business information researcher. Based on your training data,
provide what you know about the business mentioned in the query. Focus on:
- Official business address and location
- Legal/registered business name
- Business registration numbers (EIN, Tax ID)
- Parent company or aggregator relationships

Be honest about confidence levels. If you don't have reliable information, say so."""

    user = f"Research query: {query}\n\nProvide findings as if they were web search results."

    schema = {
        "type": "object",
        "properties": {
            "results": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "source": {"type": "string"},
                        "title": {"type": "string"},
                        "snippet": {"type": "string"},
                        "relevance": {"type": "string", "enum": ["high", "medium", "low"]},
                    },
                    "required": ["source", "title", "snippet", "relevance"],
                },
            }
        },
        "required": ["results"],
    }

    try:
        result = llm_client.structured_query(system, user, schema, label="Research: Analysis")
        return result.get("results", [])
    except Exception:
        return []


def _analyze_findings(
    merchant_name: str,
    violation_context: str,
    user_objective: str,
    findings: list[dict],
    affected_columns: list[str],
) -> dict:
    """Use Claude to analyze search findings and propose fixes."""
    if not findings:
        return {"analysis": "No search results found.", "suggested_fixes": []}

    findings_text = "\n".join(
        f"- [{f.get('title', 'N/A')}]({f.get('source', '')}) — {f.get('snippet', '')}"
        for f in findings[:10]
    )

    system = """You are an AMMF data quality specialist. Analyze web research findings
about a merchant and suggest specific data fixes for their AMMF record.

AMMF columns you might need to fix:
- DBAName: "Doing Business As" name
- LegalName: Legal/registered business name
- Street, City, StateProvinceCode, PostalCode: Business address
- LocationCountry: Country code
- BusinessRegistrationID: Tax ID / EIN
- BASEIIName: BASE II descriptor name

Be specific with suggested values. Only suggest fixes you're reasonably confident about."""

    user = f"""Merchant: {merchant_name}
Violation: {violation_context}
{"User objective: " + user_objective if user_objective else ""}
Affected columns: {", ".join(affected_columns)}

Web research findings:
{findings_text}

Analyze and suggest specific fixes. For each fix, provide the column name, suggested value, and your reasoning."""

    schema = {
        "type": "object",
        "properties": {
            "analysis": {"type": "string", "description": "Summary of what was found"},
            "suggested_fixes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "column": {"type": "string"},
                        "value": {"type": "string"},
                        "reasoning": {"type": "string"},
                        "confidence": {"type": "number"},
                    },
                    "required": ["column", "value", "reasoning"],
                },
            },
        },
        "required": ["analysis", "suggested_fixes"],
    }

    try:
        return llm_client.structured_query(system, user, schema, label="Research: Fix Suggestions")
    except Exception as e:
        return {"analysis": f"Analysis failed: {e}", "suggested_fixes": []}
