# AI Command Analysis Service

This document provides information about the AI Command Analysis service in InfinityOps.

## Overview

The Command Analysis Service is responsible for analyzing terminal commands and AI assistance requests using the integrated AI model (Ollama). Instead of executing commands directly, this service first processes them through AI to determine whether they should be executed, need modification, or are actually requests for AI assistance.

## Features

- **Command Recognition**: Distinguishes between bash commands and AI requests
- **Command Safety Analysis**: Evaluates commands for potential risks before execution
- **AI Assistance**: Provides helpful responses for non-command queries
- **Conversation Context**: Maintains conversation history for context-aware responses
- **Common Command Bypass**: Automatically bypasses AI analysis for common shell commands

## Configuration

The Command Analysis Service can be configured through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `COMMAND_BYPASS_MODE` | Mode for AI bypass: 'none', 'common', or 'all' | 'common' |
| `BYPASS_COMMANDS` | Comma-separated list of commands that bypass AI | See below |

### Bypass Modes

- **none**: All commands are analyzed by AI (slowest, most comprehensive)
- **common**: Common simple commands bypass AI analysis (balanced approach)
- **all**: All commands bypass AI (fastest, least safe)

### Default Bypass Commands

The following common commands bypass AI analysis in 'common' mode by default:
```
ls, cd, pwd, clear, history, echo, cat, mkdir, touch, cp, mv, date, 
whoami, df, du, free, ps, top, uname, hostname, ifconfig, ip
```

Commands containing potentially risky elements (e.g., `sudo`, `rm`, `>`, pipes, etc.) will always be analyzed by AI even if the base command is in the bypass list.

## WebSocket API

The WebSocket service supports the following message types related to the AI Command Analysis:

### Client → Server Messages

| Message Type | Payload | Description |
|--------------|---------|-------------|
| `terminalCommand` | `{ command: string, path: string }` | Send a command for AI analysis and possible execution |
| `clearHistory` | `{}` | Clear conversation history for the client |

### Server → Client Messages

| Message Type | Payload | Description |
|--------------|---------|-------------|
| `terminalResponse` | `{ command: string, output: string, analysisType: string, path: string, success: boolean, bypassedAI: boolean }` | Response to a command |
| `historyCleared` | `{ success: boolean }` | Confirmation of history clearing |

## Testing

You can test the Command Analysis Service using the provided script:

```bash
# Test with a bash command
npm run test:command "ls -la"

# Test with an AI assistance request
npm run test:command "explain how to check disk usage"

# Test with a potentially dangerous command
npm run test:command "rm -rf /"
```

## How Commands Are Processed

1. The client sends a command via WebSocket
2. The service checks if the command is in the bypass list
3. For bypassed commands, they're executed directly
4. For other commands, they're sent to the AI for analysis
5. The AI analyzes the command and returns a structured JSON response
6. For bash commands marked as executable, the system executes them
7. The response is sent back to the client
8. The conversation history is updated (except for bypassed commands)

## Security Considerations

- The AI acts as a safety filter for potentially harmful commands
- Even with bypass mode, potentially dangerous commands are still analyzed
- System administrators should configure the bypass mode and commands list appropriate for their environment
- The service does not eliminate all security risks of command execution 