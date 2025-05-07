# AI 命令解析模块设计

## 1. 模块概述

AI命令解析模块是InfinityOps智能终端的核心组件，负责分析和处理用户输入的命令。该模块在WebSocket服务中接收到用户输入命令时被调用，根据命令类型和配置决定如何处理命令，并返回相应的执行策略。

## 2. 功能需求

1. **命令分类识别**
   - 判断命令是否属于需要跳过AI分析的基本命令（如ls, cd等）
   - 识别交互式命令（如vim, nano, python交互模式等）
   - 识别是否需要交给MCP服务执行的命令
   - 分析命令的合法性和潜在错误

2. **执行策略确定**
   - 对于基本命令，直接执行
   - 对于交互式命令，转换终端状态为交互模式并执行
   - 对于MCP命令，转发给MCP服务处理
   - 对于有错误的命令，提供修正建议
   - 对于普通命令，执行前进行分析和可能的优化

3. **响应生成**
   - 生成标准化的JSON响应格式
   - 包含执行策略、命令类型、修正建议等信息

## 3. 模块流程

```
接收命令 -> 判断是否跳过分析 -> 判断是否交互命令 -> 判断是否MCP命令 -> 命令合法性检查 -> 返回执行策略
```

### 详细流程：

1. **接收命令**
   - 从WebSocket服务中接收用户输入的命令

2. **判断是否跳过分析**
   - 检查命令是否在.env文件的BYPASS_COMMANDS列表中
   - 根据COMMAND_BYPASS_MODE确定是否跳过AI分析

3. **判断是否交互命令**
   - 使用AI分析命令是否为交互式命令（如vim, nano等）
   - 识别编程语言的交互式环境（如python, node等，不包括执行脚本）

4. **判断是否MCP命令**
   - 分析命令是否需要由MCP服务处理
   - MCP服务处理逻辑预留接口，待后续实现

5. **命令合法性检查**
   - 分析命令的语法是否正确
   - 检查命令是否可能导致系统问题
   - 提供可能的修正或优化建议

6. **返回执行策略**
   - 生成包含处理策略的JSON响应
   - 返回给调用者执行相应操作

## 4. 响应格式

```json
{
  "commandType": "basic | interactive | mcp | invalid",
  "shouldExecute": true | false,
  "shouldChangeTerminalState": true | false,
  "newTerminalState": "normal | interactive | config",
  "modifiedCommand": "实际执行的命令（可能被修改）",
  "explanation": "命令解析说明或建议",
  "feedback": {
    "needsFeedback": true | false,
    "message": "向用户展示的信息"
  },
  "analysis": {
    "commandPurpose": "命令目的分析",
    "potentialIssues": ["潜在问题1", "潜在问题2"],
    "alternatives": ["替代命令1", "替代命令2"]
  },
  "mcpInfo": {
    "serviceName": "fileManager | systemInfo | toolRunner | scriptManager",
    "serviceId": "服务唯一标识符",
    "params": {
      "param1": "值1",
      "param2": "值2"
    },
    "priority": 1-10
  }
}
```

`mcpInfo` 字段是可选的，仅当 `commandType` 为 `"mcp"` 时出现，用于指定需要调用的MCP服务信息：

- `serviceName`: MCP服务名称，指定要使用的MCP服务类型
- `serviceId`: 服务唯一标识符，用于在多个同名服务实例中选择特定实例
- `params`: 服务参数，提供给MCP服务的参数对象
- `priority`: 优先级，数值越小优先级越高，影响服务调度顺序

## 5. 配置项

从.env文件读取以下配置：

1. **COMMAND_BYPASS_MODE**
   - `none`: 所有命令都经过AI分析
   - `common`: 常用命令跳过AI分析（使用BYPASS_COMMANDS列表）
   - `all`: 所有命令都跳过AI分析

2. **BYPASS_COMMANDS**
   - 逗号分隔的命令列表，这些命令将跳过AI分析
   - 默认：`ls,cd,pwd,clear,history,echo,cat,mkdir,touch,cp,mv,date,whoami,df,du,free,ps,top,uname,hostname,ifconfig,ip`

3. **AI模型配置**
   - 使用.env中的DEFAULT_AI_PROVIDER和DEFAULT_AI_MODEL配置

## 6. 实现策略

1. **命令解析服务**
   - 创建CommandAnalysisService类处理命令解析逻辑
   - 使用AIFactory创建AI服务实例进行命令分析
   - 实现配置加载和缓存机制提高性能

2. **优化考虑**
   - 对常用命令的结果进行缓存，减少AI调用
   - 实现命令历史记忆，提高分析准确性
   - 添加命令解析的超时机制，确保响应及时

## 7. 与其他模块的集成

1. **与WebSocket服务集成**
   - 在用户发送命令时调用命令解析服务
   - 根据解析结果决定后续操作

2. **与终端状态管理集成**
   - 根据解析结果更新终端状态
   - 交互命令自动切换终端到交互模式

3. **与MCP服务集成**
   - 识别需要MCP处理的命令
   - 将命令转发给MCP服务并处理结果
   - 根据 `mcpInfo` 中的 `serviceName` 和 `serviceId` 选择合适的MCP服务
   - 根据 `params` 传递参数给MCP服务
   - 使用 `priority` 在多个服务可处理同一命令时进行优先级排序

## 8. 后续扩展

1. **命令智能补全**
   - 根据历史命令和上下文提供更智能的补全建议

2. **命令优化建议**
   - 分析用户习惯，提供更高效的命令使用建议

3. **安全性检查**
   - 识别潜在危险命令并提供警告
   - 添加敏感操作的确认机制 