### Requirement: OpenAI messages to pi-ai context conversion
The system SHALL convert OpenAI Chat Completions message arrays into pi-ai `Context` objects with system prompt and messages.

#### Scenario: System message extraction
- **WHEN** OpenAI messages include a message with `role: "system"`
- **THEN** the system SHALL extract it as the `systemPrompt` field of the pi-ai Context

#### Scenario: Multiple system messages
- **WHEN** OpenAI messages include multiple system messages
- **THEN** the system SHALL concatenate them with newlines into a single `systemPrompt`

#### Scenario: User text message
- **WHEN** an OpenAI message has `role: "user"` and string content
- **THEN** the system SHALL convert it to a pi-ai `UserMessage` with the text content

#### Scenario: User multimodal message
- **WHEN** an OpenAI message has `role: "user"` with content parts including `image_url` with base64 data
- **THEN** the system SHALL convert image parts to pi-ai `ImageContent` with extracted mime type and data

#### Scenario: Assistant message with text
- **WHEN** an OpenAI message has `role: "assistant"` with text content
- **THEN** the system SHALL convert it to a pi-ai `AssistantMessage` with `TextContent`

#### Scenario: Assistant message with tool calls
- **WHEN** an OpenAI message has `role: "assistant"` with `tool_calls`
- **THEN** the system SHALL convert each tool call to a pi-ai `ToolCall` with parsed JSON arguments

#### Scenario: Tool result message
- **WHEN** an OpenAI message has `role: "tool"` with `tool_call_id`
- **THEN** the system SHALL convert it to a pi-ai `ToolResultMessage`

### Requirement: pi-ai events to OpenAI streaming conversion
The system SHALL convert pi-ai `AssistantMessageEvent` stream events into OpenAI SSE chunks.

#### Scenario: Stream start event
- **WHEN** a `start` event is received
- **THEN** the system SHALL emit an SSE chunk with `delta: { role: "assistant" }`

#### Scenario: Text delta event
- **WHEN** a `text_delta` event is received
- **THEN** the system SHALL emit an SSE chunk with `delta: { content: "<text>" }`

#### Scenario: Thinking delta event
- **WHEN** a `thinking_delta` event is received
- **THEN** the system SHALL emit an SSE chunk with `delta: { reasoning_content: "<text>" }`

#### Scenario: Tool call start event
- **WHEN** a `toolcall_start` event is received
- **THEN** the system SHALL emit an SSE chunk with the tool call id, name, and proper `index` based on tool call position

#### Scenario: Tool call delta event
- **WHEN** a `toolcall_delta` event is received
- **THEN** the system SHALL emit an SSE chunk with argument delta and the correct tool call `index`

#### Scenario: Done event
- **WHEN** a `done` event is received
- **THEN** the system SHALL emit an SSE chunk with the appropriate `finish_reason` and usage stats, followed by `data: [DONE]`

#### Scenario: Multiple concurrent tool calls
- **WHEN** an assistant response contains multiple tool calls
- **THEN** each tool call SHALL have a unique, sequential `index` (0, 1, 2, ...) in SSE chunks

### Requirement: pi-ai events to OpenAI non-streaming conversion
The system SHALL collect pi-ai events and return a complete OpenAI Chat Completion response object.

#### Scenario: Text response
- **WHEN** the final pi-ai message contains text content
- **THEN** the response SHALL include the text in `choices[0].message.content`

#### Scenario: Tool call response
- **WHEN** the final pi-ai message contains tool calls
- **THEN** the response SHALL include them in `choices[0].message.tool_calls` with `finish_reason: "tool_calls"`

#### Scenario: Usage stats
- **WHEN** a non-streaming response is generated
- **THEN** the response SHALL include `usage` with `prompt_tokens`, `completion_tokens`, and `total_tokens`

### Requirement: OpenAI tool definitions conversion
The system SHALL convert OpenAI tool definitions to pi-ai tool format.

#### Scenario: Function tool conversion
- **WHEN** OpenAI request includes tools with `type: "function"`
- **THEN** the system SHALL convert them to pi-ai tools with `name`, `description`, and `parameters`
