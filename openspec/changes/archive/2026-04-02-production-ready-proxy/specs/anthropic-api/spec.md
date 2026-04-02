## ADDED Requirements

### Requirement: Anthropic messages to pi-ai context conversion
The system SHALL convert Anthropic Messages API requests into pi-ai `Context` objects.

#### Scenario: System prompt extraction
- **WHEN** an Anthropic request includes a `system` field (string or content blocks)
- **THEN** the system SHALL extract it as the pi-ai `systemPrompt`

#### Scenario: User text message
- **WHEN** an Anthropic message has `role: "user"` with string content
- **THEN** the system SHALL convert it to a pi-ai `UserMessage`

#### Scenario: User content blocks
- **WHEN** an Anthropic message has `role: "user"` with content blocks (text, image)
- **THEN** the system SHALL convert each block to the corresponding pi-ai content type

#### Scenario: Assistant message with tool_use blocks
- **WHEN** an Anthropic message has `role: "assistant"` with `tool_use` content blocks
- **THEN** the system SHALL convert each to a pi-ai `ToolCall`

#### Scenario: User tool_result blocks
- **WHEN** an Anthropic message has `role: "user"` with `tool_result` content blocks
- **THEN** the system SHALL convert each to a pi-ai `ToolResultMessage`

### Requirement: pi-ai events to Anthropic streaming conversion
The system SHALL convert pi-ai events into Anthropic SSE format using Anthropic's event types.

#### Scenario: Stream start
- **WHEN** a `start` event is received
- **THEN** the system SHALL emit a `message_start` SSE event with Anthropic message structure

#### Scenario: Text delta
- **WHEN** a `text_delta` event is received
- **THEN** the system SHALL emit a `content_block_delta` event with `type: "text_delta"`

#### Scenario: Thinking delta
- **WHEN** a `thinking_delta` event is received
- **THEN** the system SHALL emit a `content_block_delta` event with `type: "thinking_delta"`

#### Scenario: Tool call streaming
- **WHEN** `toolcall_start` and `toolcall_delta` events are received
- **THEN** the system SHALL emit `content_block_start` with `type: "tool_use"` followed by `content_block_delta` events with `input_json_delta`

#### Scenario: Stream end
- **WHEN** a `done` event is received
- **THEN** the system SHALL emit `message_delta` with `stop_reason` and `usage`, followed by `message_stop`

### Requirement: pi-ai events to Anthropic non-streaming conversion
The system SHALL return a complete Anthropic Messages response when streaming is not requested.

#### Scenario: Text response
- **WHEN** the final pi-ai message contains text
- **THEN** the response SHALL include a `text` content block and `stop_reason: "end_turn"`

#### Scenario: Tool use response
- **WHEN** the final pi-ai message contains tool calls
- **THEN** the response SHALL include `tool_use` content blocks and `stop_reason: "tool_use"`

#### Scenario: Usage in response
- **WHEN** a non-streaming response is generated
- **THEN** the response SHALL include `usage` with `input_tokens` and `output_tokens`

### Requirement: Anthropic Messages API endpoint
The server SHALL expose `POST /v1/messages` accepting Anthropic Messages API format.

#### Scenario: Successful streaming request
- **WHEN** a valid Anthropic Messages request is sent with `stream: true`
- **THEN** the server SHALL respond with Anthropic-format SSE events

#### Scenario: Successful non-streaming request
- **WHEN** a valid Anthropic Messages request is sent without streaming
- **THEN** the server SHALL respond with a complete Anthropic Messages response object

#### Scenario: Model resolution
- **WHEN** the request `model` field contains a `provider/model-id` string or an alias
- **THEN** the server SHALL resolve it through the model registry (with alias lookup)
