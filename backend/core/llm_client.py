import json
import anthropic
from core.config import settings


class LLMClient:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.model = settings.claude_model

    def structured_query(self, system_prompt: str, user_prompt: str, output_schema: dict) -> dict:
        """Query Claude with a tool-use pattern to get structured JSON output."""
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
        for block in response.content:
            if block.type == "tool_use" and block.name == "submit_result":
                return block.input
        raise ValueError("No structured output received from Claude")

    def text_query(self, system_prompt: str, user_prompt: str) -> str:
        """Query Claude for free-form text response."""
        response = self.client.messages.create(
            model=self.model,
            max_tokens=8192,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return response.content[0].text

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
