### Requirement: Model alias resolution
The system SHALL resolve model aliases to full `provider/model-id` strings using a configurable lookup table.

#### Scenario: Alias match
- **WHEN** a request specifies `model: "sonnet"` and config has `aliases: { "sonnet": "anthropic/claude-sonnet-4-5-20250929" }`
- **THEN** the system SHALL resolve the model to `anthropic/claude-sonnet-4-5-20250929`

#### Scenario: No alias match — treat as literal
- **WHEN** a request specifies `model: "anthropic/claude-sonnet-4-5-20250929"` and no alias matches
- **THEN** the system SHALL treat it as a literal `provider/model-id`

#### Scenario: Alias without slash in value
- **WHEN** an alias value does not contain a `/` separator
- **THEN** the system SHALL reject the config at load time with a clear error message

### Requirement: Alias configuration
The `aliases` field in config SHALL be an object mapping short names to full `provider/model-id` strings.

#### Scenario: Config with aliases
- **WHEN** config contains `"aliases": { "sonnet": "anthropic/claude-sonnet-4-5-20250929", "gpt4": "openai/gpt-4o" }`
- **THEN** both aliases SHALL be available for model resolution

#### Scenario: Empty or missing aliases
- **WHEN** config has no `aliases` field or an empty object
- **THEN** the system SHALL operate normally with only literal `provider/model-id` resolution
