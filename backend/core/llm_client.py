import json
import time
import anthropic
from core.config import settings


class LLMCallLog:
    """Stores details of a single LLM call."""
    def __init__(self, call_id, method, system_prompt, user_prompt, label=None):
        self.call_id = call_id
        self.method = method
        self.label = label or method  # Human-readable name for the call
        self.system_prompt = system_prompt
        self.user_prompt = user_prompt
        self.output = ""
        self.model = ""
        self.input_tokens = 0
        self.output_tokens = 0
        self.cost_usd = 0.0
        self.duration_ms = 0
        self.timestamp = time.time()
        self.error = None

    def to_dict(self):
        return {
            "call_id": self.call_id,
            "method": self.method,
            "label": self.label,
            "model": self.model,
            "system_prompt": self.system_prompt[:2000],
            "user_prompt": self.user_prompt[:5000],
            "output": self.output[:5000],
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost_usd": round(self.cost_usd, 6),
            "duration_ms": self.duration_ms,
            "timestamp": self.timestamp,
            "error": self.error,
        }


# Pricing per million tokens
PRICING = {
    "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
}
DEFAULT_PRICING = {"input": 3.0, "output": 15.0}


def summarize_logs(logs):
    """Build a summary dict from a list of LLMCallLog objects."""
    total_input = sum(getattr(l, "input_tokens", 0) for l in logs)
    total_output = sum(getattr(l, "output_tokens", 0) for l in logs)
    total_cost = sum(getattr(l, "cost_usd", 0.0) for l in logs)
    total_duration = sum(getattr(l, "duration_ms", 0) for l in logs)
    return {
        "total_calls": len(logs),
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_tokens": total_input + total_output,
        "total_cost_usd": round(total_cost, 6),
        "total_duration_ms": total_duration,
        "calls": [l.to_dict() for l in logs],
    }


class LLMClient:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.model = settings.claude_model
        self._call_counter = 0
        self._active_log_list = None
        # Global log captures ALL calls (pipeline + chat + config routes)
        self._global_log_list: list[LLMCallLog] = []

    def bind_job(self, job):
        """Bind to a job - resets job's logs for fresh run."""
        job.llm_call_logs = []
        self._active_log_list = job.llm_call_logs
        self._call_counter = 0

    def unbind_job(self):
        self._active_log_list = None

    def get_global_logs(self) -> list:
        """Return all LLM calls ever made (across all jobs and non-job contexts)."""
        return self._global_log_list

    def _compute_cost(self, input_tokens, output_tokens):
        pricing = PRICING.get(self.model, DEFAULT_PRICING)
        return (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000

    def _log_call(self, method, system_prompt, user_prompt, label=None):
        self._call_counter += 1
        log = LLMCallLog(self._call_counter, method, system_prompt, user_prompt, label=label)
        log.model = self.model
        if self._active_log_list is not None:
            self._active_log_list.append(log)
        # Always capture in global list
        self._global_log_list.append(log)
        return log

    def structured_query(self, system_prompt, user_prompt, output_schema, label=None):
        """Query Claude with a tool-use pattern to get structured JSON output."""
        log = self._log_call("structured_query", system_prompt, user_prompt, label=label)
        start = time.time()
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=8192,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
                tools=[{
                    "name": "submit_result",
                    "description": "Submit the structured result",
                    "input_schema": output_schema,
                }],
                tool_choice={"type": "tool", "name": "submit_result"},
            )
            log.duration_ms = int((time.time() - start) * 1000)
            log.input_tokens = response.usage.input_tokens
            log.output_tokens = response.usage.output_tokens
            log.cost_usd = self._compute_cost(log.input_tokens, log.output_tokens)

            for block in response.content:
                if block.type == "tool_use" and block.name == "submit_result":
                    log.output = json.dumps(block.input)[:5000]
                    return block.input
            raise ValueError("No structured output received from Claude")
        except Exception as e:
            log.duration_ms = int((time.time() - start) * 1000)
            log.error = str(e)
            raise

    def text_query(self, system_prompt, user_prompt, label=None):
        """Query Claude for free-form text response."""
        log = self._log_call("text_query", system_prompt, user_prompt, label=label)
        start = time.time()
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=8192,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            log.duration_ms = int((time.time() - start) * 1000)
            log.input_tokens = response.usage.input_tokens
            log.output_tokens = response.usage.output_tokens
            log.cost_usd = self._compute_cost(log.input_tokens, log.output_tokens)
            log.output = response.content[0].text[:5000]
            return response.content[0].text
        except Exception as e:
            log.duration_ms = int((time.time() - start) * 1000)
            log.error = str(e)
            raise

    def sql_query(self, system_prompt, user_prompt, label=None):
        """Query Claude specifically for SQL generation."""
        schema = {
            "type": "object",
            "properties": {
                "sql": {"type": "string", "description": "The complete DuckDB SQL query"},
                "explanation": {"type": "string", "description": "Brief explanation of the query logic"},
            },
            "required": ["sql", "explanation"],
        }
        result = self.structured_query(system_prompt, user_prompt, schema, label=label)
        return result["sql"]


llm_client = LLMClient()
