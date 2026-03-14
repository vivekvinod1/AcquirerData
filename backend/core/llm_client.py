import json
import time
import anthropic
from core.config import settings


class LLMCallLog:
    """Stores details of a single LLM call."""
    def __init__(self, call_id: int, method: str, system_prompt: str, user_prompt: str):
        self.call_id = call_id
        self.method = method
        self.system_prompt = system_prompt
        self.user_prompt = user_prompt
        self.output: str = ""
        self.model: str = ""
        self.input_tokens: int = 0
        self.output_tokens: int = 0
        self.cost_usd: float = 0.0
        self.duration_ms: int = 0
        self.timestamp: float = time.time()
        self.error: str | None = None

    def to_dict(self) -> dict:
        return {
            "call_id": self.call_id,
            "method": self.method,
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


class LLMClient:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.model = settings.claude_model
        self._call_logs: list[LLMCallLog] = []
        self._call_counter = 0

    def get_call_logs(self) -> list[dict]:
        return [log.to_dict() for log in self._call_logs]

    def get_call_summary(self) -> dict:
        total_input = sum(l.input_tokens for l in self._call_logs)
        total_output = sum(l.output_tokens for l in self._call_logs)
        total_cost = sum(l.cost_usd for l in self._call_logs)
        total_duration = sum(l.duration_ms for l in self._call_logs)
        return {
            "total_calls": len(self._call_logs),
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_tokens": total_input + total_output,
            "total_cost_usd": round(total_cost, 6),
            "total_duration_ms": total_duration,
            "calls": self.get_call_logs(),
        }

    def _compute_cost(self, input_tokens: int, output_tokens: int) -> float:
        pricing = PRICING.get(self.model, DEFAULT_PRICING)
        return (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000

    def _log_call(self, method: str, system_prompt: str, user_prompt: str) -> LLMCallLog:
        self._call_counter += 1
        log = LLMCallLog(self._call_counter, method, system_prompt, user_prompt)
        log.model = self.model
        self._call_logs.append(log)
        return log

    def structured_query(self, system_prompt: str, user_prompt: str, output_schema: dict) -> dict:
        """Query Claude with a tool-use pattern to get structured JSON output."""
        log = self._log_call("structured_query", system_prompt, user_prompt)
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

    def text_query(self, system_prompt: str, user_prompt: str) -> str:
        """Query Claude for free-form text response."""
        log = self._log_call("text_query", system_prompt, user_prompt)
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

    def sql_query(self, system_prompt: str, user_prompt: str) -> str:
        """Query Claude specifically for SQL generation."""
        schema = {
            "type": "object",
            "properties": {
                "sql": {"type": "string", "description": "The complete DuckDB SQL query"},
                "explanation": {"type": "string", "description": "Brief explanation of the query logic"},
            },
            "required": ["sql", "explanation"],
        }
        result = self.structured_query(system_prompt, user_prompt, schema)
        return result["sql"]


llm_client = LLMClient()
