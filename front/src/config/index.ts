/**
 * Application configuration
 */
const config = {
  api: {
    baseUrl: process.env.REACT_APP_API_URL || 'http://localhost:4000',
    wsUrl: process.env.REACT_APP_WS_URL || 'ws://localhost:4010'
  },
  terminal: {
    fontSize: 14,
    fontFamily: 'monospace',
    cursorBlink: true
  }
};

export default config; 