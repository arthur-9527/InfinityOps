/**
 * Example environment variables configuration for InfinityOps
 * 
 * Copy these settings to your .env file and modify as needed.
 */

export const exampleEnvConfig = `
# Server configuration
PORT=3000
NODE_ENV=development
WS_PORT=3002

# JWT configuration
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h

# Session configuration
SESSION_TIMEOUT=3600000
MAX_SESSIONS_PER_USER=5

# Logging
LOG_LEVEL=debug

# AI Provider Configuration
AI_PROVIDER=ollama
OLLAMA_API_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama2

# Command Analysis Configuration
# Modes: 'none' (always use AI), 'common' (bypass for common commands), 'all' (bypass for all commands)
COMMAND_BYPASS_MODE=common

# Comma-separated list of commands that bypass AI analysis (in 'common' mode)
# Example: Override the default list of commands
BYPASS_COMMANDS=ls,cd,pwd,clear,history,echo,cat,mkdir,touch,cp,mv,date,whoami,df,du,free,ps,top,uname,hostname,ifconfig,ip

# Weather MCP Service Configuration
WEATHER_MCP_URL=http://localhost:5001
WEATHER_MCP_API_KEY=your-api-key-here
`;

/**
 * Print example configuration to console
 */
export function printExampleConfig(): void {
  console.log(exampleEnvConfig);
}

// If this script is run directly, print the example config
if (require.main === module) {
  printExampleConfig();
} 