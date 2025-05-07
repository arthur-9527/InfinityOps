/**
 * 命令分析服务测试脚本
 * 
 * 使用方法:
 * node test.js "要测试的命令"
 * 
 * 例如:
 * node test.js "ls -la"
 * node test.js "vim test.txt"
 * node test.js "intellicode analyze app.js"
 */

import { commandAnalysisService } from './service';
import { TerminalState } from './interfaces';

async function testCommandAnalysis() {
  try {
    // 获取测试命令
    const command = process.argv[2] || 'ls -la';
    
    console.log(`\n==== 测试命令: "${command}" ====\n`);
    
    // 分析命令
    const result = await commandAnalysisService.analyzeCommand({
      command,
      currentTerminalState: 'normal' as TerminalState,
      osInfo: {
        platform: 'linux',
        distribution: 'Ubuntu',
        version: '20.04'
      }
    });
    
    // 打印结果
    console.log('命令类型:', result.commandType);
    console.log('是否执行:', result.shouldExecute);
    console.log('是否改变终端状态:', result.shouldChangeTerminalState);
    console.log('新终端状态:', result.newTerminalState);
    console.log('修改后的命令:', result.modifiedCommand);
    console.log('命令解释:', result.explanation);
    console.log('需要反馈:', result.feedback.needsFeedback);
    
    if (result.feedback.needsFeedback) {
      console.log('反馈消息:', result.feedback.message);
    }
    
    console.log('\n命令分析:');
    console.log('- 目的:', result.analysis.commandPurpose);
    
    if (result.analysis.potentialIssues.length > 0) {
      console.log('- 潜在问题:');
      result.analysis.potentialIssues.forEach(issue => {
        console.log(`  * ${issue}`);
      });
    }
    
    if (result.analysis.alternatives.length > 0) {
      console.log('- 替代命令:');
      result.analysis.alternatives.forEach(alt => {
        console.log(`  * ${alt}`);
      });
    }
    
    if (result.mcpInfo) {
      console.log('\nMCP服务信息:');
      console.log('- 服务名称:', result.mcpInfo.serviceName);
      if (result.mcpInfo.serviceId) {
        console.log('- 服务ID:', result.mcpInfo.serviceId);
      }
      if (result.mcpInfo.params) {
        console.log('- 参数:', JSON.stringify(result.mcpInfo.params, null, 2));
      }
      console.log('- 优先级:', result.mcpInfo.priority || 5);
    }
    
    console.log('\n==== 测试完成 ====\n');
  } catch (error) {
    console.error('测试发生错误:', error);
  }
}

// 执行测试
testCommandAnalysis(); 