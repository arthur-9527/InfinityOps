import React from 'react';
import Terminal from './components/terminal/Terminal';
import WebSocketStatus from './components/WebSocketStatus';
import './App.css';

function App() {
  return (
    <div className="app-container">
      <div className="terminal-container">
        <div className="terminal-header">
          <div className="terminal-buttons">
            <div className="terminal-button close"></div>
            <div className="terminal-button minimize"></div>
            <div className="terminal-button maximize"></div>
          </div>
          <div className="terminal-title">Terminal</div>
          <div style={{ width: "70px" }}></div> {/* Spacer to balance the title */}
        </div>
        <WebSocketStatus />
        <div className="terminal-body">
          <Terminal initialCommand="Last login: Wed Jun  3 21:56:14 on ttys003\ntest@server ~ $ " />
        </div>
      </div>
    </div>
  );
}

export default App; 