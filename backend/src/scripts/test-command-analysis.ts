#!/usr/bin/env node
/**
 * Command Analysis Service test script
 * 
 * Usage:
 * ts-node src/scripts/test-command-analysis.ts "ls -la"
 * ts-node src/scripts/test-command-analysis.ts "help me with disk usage"
 */

import { commandAnalysisService } from '../services/commandAnalysisService';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('test-command-analysis');

// Get command from command line
const command = process.argv[2];
const path = process.argv[3] || '~';

if (!command) {
  logger.error('No command provided. Usage: ts-node test-command-analysis.ts "your command"');
  process.exit(1);
}

async function testCommandAnalysis() {
  logger.info(`Testing command analysis for: "${command}" in path "${path}"`);
  
  try {
    // Test regular analysis
    logger.info('Standard analysis:');
    const result = await commandAnalysisService.analyzeCommand(command, path);
    
    logger.info('Analysis result:');
    logger.info(`Type: ${result.type}`);
    logger.info(`Should execute: ${result.shouldExecute}`);
    logger.info(`Success: ${result.success}`);
    logger.info(`Bypassed AI: ${result.bypassedAI || false}`);
    
    if (result.securityRisk) {
      logger.info(`Security risk: ${result.securityRisk}`);
    }
    
    // Log command if present
    if (result.command) {
      logger.info(`Command: ${result.command}`);
    }
    
    // Log content with some formatting
    logger.info('Content:');
    logger.info('---------');
    logger.info(result.content);
    logger.info('---------');
    
    // If not bypassed, perform security analysis as well
    if (!result.bypassedAI) {
      logger.info('\nPerforming security analysis:');
      const securityResult = await commandAnalysisService.analyzeSecurityRisks(command, path);
      
      logger.info('Security analysis result:');
      logger.info(`Type: ${securityResult.type}`);
      logger.info(`Should execute: ${securityResult.shouldExecute}`);
      logger.info(`Success: ${securityResult.success}`);
      
      if (securityResult.securityRisk) {
        logger.info(`Security risk: ${securityResult.securityRisk}`);
      }
      
      if (securityResult.command) {
        logger.info(`Command: ${securityResult.command}`);
      }
      
      // Log content with some formatting
      logger.info('Content:');
      logger.info('---------');
      logger.info(securityResult.content);
      logger.info('---------');
    }
  } catch (error) {
    logger.error(`Test failed: ${error}`);
    process.exit(1);
  }
}

// Run the test
testCommandAnalysis(); 