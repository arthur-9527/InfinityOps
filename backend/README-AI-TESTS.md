# AI模块测试指南

这个文档提供了如何测试InfinityOps后端AI模块的指南。

## 前提条件

1. 确保您已经设置了本地Ollama服务，或者有访问其他AI服务提供者的权限
2. 如果使用Ollama，请确保已经安装并运行了Ollama服务器
3. 确保您的环境变量正确配置（如有必要）

## 环境变量配置

您可以通过`.env`文件或直接设置环境变量来配置AI服务:

```dotenv
# AI提供者选择
AI_PROVIDER=ollama

# Ollama配置
OLLAMA_API_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama2
OLLAMA_TEMPERATURE=0.7
OLLAMA_TOP_P=0.9
OLLAMA_TOP_K=40
OLLAMA_NUM_PREDICT=128
```

## 运行测试

### 运行所有测试

执行以下命令来运行所有AI模块测试:

```bash
cd backend
npm run test:ai
# 或者直接使用ts-node
npx ts-node src/scripts/test-ai.ts
```

### 运行特定测试

您可以通过提供参数来运行特定的测试:

```bash
# 只测试AI服务工厂
npx ts-node src/scripts/test-ai.ts factory

# 只测试模型列表功能
npx ts-node src/scripts/test-ai.ts models

# 只测试文本补全功能
npx ts-node src/scripts/test-ai.ts completion

# 只测试Ollama服务
npx ts-node src/scripts/test-ai.ts ollama
```

## 测试说明

1. **服务工厂测试** - 验证AI服务工厂能否正确创建服务实例
2. **模型列表测试** - 验证能否获取可用模型列表
3. **文本补全测试** - 验证文本补全功能是否正常工作
4. **Ollama服务测试** - 直接测试Ollama服务实例

## 故障排除

如果测试失败，请检查以下几点:

1. 确保Ollama服务正在运行，默认地址为 `http://localhost:11434`
2. 确保您的网络能够访问Ollama服务
3. 检查日志输出，查看具体错误信息
4. 确保所使用的模型已经在Ollama中加载

## 添加新的测试

如果您想添加新的测试，请修改 `src/tests/ai.test.ts` 文件，并在 `runTests()` 函数中添加相应的测试调用。 