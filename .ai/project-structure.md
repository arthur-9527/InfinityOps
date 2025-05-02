# InfinityOps 项目结构

## 目录结构

```
InfinityOps/
├── .ai/                       # AI辅助相关文档
│   ├── project-structure.md  # 项目结构文档
│   ├── worklogs.md           # 工作日志
│   └── ...                   # 其他AI辅助文档
│
├── backend/                   # 后端应用
│   ├── config/               # 配置文件目录
│   ├── dist/                 # 编译输出目录
│   ├── logs/                 # 日志目录
│   ├── src/                  # 源代码目录
│   │   ├── config/           # 配置模块
│   │   ├── controllers/      # 控制器
│   │   │   └── terminal/     # 终端控制器
│   │   ├── guards/           # 守卫
│   │   ├── middlewares/      # 中间件
│   │   ├── modules/          # 功能模块
│   │   │   ├── ai/           # AI模块
│   │   │   ├── mcp/          # MCP模块
│   │   │   ├── monitoring/   # 监控模块
│   │   │   └── ssh/          # SSH模块
│   │   ├── scripts/          # 脚本
│   │   ├── services/         # 服务层
│   │   │   ├── ssh/          # SSH服务
│   │   │   ├── commandAnalysisService.ts # 命令分析服务
│   │   │   └── websocketService.ts # WebSocket服务
│   │   ├── tests/            # 测试
│   │   ├── types/            # 类型定义
│   │   ├── utils/            # 工具函数
│   │   ├── app.ts            # 应用主文件
│   │   └── index.ts          # 入口文件
│   └── package.json          # 后端依赖配置
│
├── front/                     # 前端应用
│   ├── public/                # 静态资源
│   │   └── assets/           # 静态资源文件
│   ├── src/                   # 源代码目录
│   │   ├── components/        # React组件
│   │   │   ├── ai/            # AI相关组件
│   │   │   ├── common/        # 通用组件
│   │   │   ├── plugins/       # 插件相关组件
│   │   │   ├── terminal/      # 终端相关组件
│   │   │   └── WebSocketStatus.tsx # WebSocket状态组件
│   │   ├── config/            # 配置
│   │   ├── services/          # 服务层
│   │   │   ├── terminal.service.ts  # 终端服务
│   │   │   └── websocket.service.ts # WebSocket服务
│   │   ├── stores/            # 状态管理
│   │   ├── types/             # 类型定义
│   │   ├── utils/             # 工具函数
│   │   ├── App.tsx            # 应用主组件
│   │   └── index.tsx          # 入口文件
│   └── package.json           # 前端依赖配置
│
├── docs/                      # 文档目录
│   ├── ai/                    # AI相关文档
│   ├── api/                   # API文档
│   ├── development/           # 开发文档
│   └── guides/                # 使用指南
│
├── .gitignore                 # Git忽略文件
└── README.md                  # 项目说明文档
```

## 开发环境要求

### 系统要求
- Node.js >= 18.0.0
- npm >= 8.0.0
- Git >= 2.0.0

### 开发工具
- VS Code（推荐）
- Git
- Docker（可选，用于开发环境）

## 初始化步骤

1. 克隆项目
```bash
git clone https://github.com/arthur-9527/InfinityOps.git
cd InfinityOps
```

2. 安装依赖
```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../front
npm install
```

3. 启动开发服务器
```bash
# 启动后端服务
cd backend
npm run dev

# 启动前端服务（在新的终端）
cd front
npm run dev
```

## 开发流程

### 1. 分支管理
- `main`: 主分支，用于生产环境
- `develop`: 开发分支，用于集成功能
- `feature/*`: 功能分支，用于开发新功能
- `bugfix/*`: 修复分支，用于修复问题
- `release/*`: 发布分支，用于版本发布

### 2. 代码规范
- 使用 ESLint 进行代码检查
- 使用 Prettier 进行代码格式化
- 使用 TypeScript 进行类型检查
- 遵循 Git 提交规范

### 3. 测试要求
- 新功能必须包含单元测试
- 核心功能必须包含集成测试
- 关键流程必须包含 E2E 测试

### 4. 构建流程
```bash
# 后端构建
cd backend
npm run build

# 前端构建
cd front
npm run build
```

## 主要功能模块

1. **终端模块**
   - WebSocket实时通信
   - 命令执行与展示
   - 历史记录管理

2. **AI命令分析**
   - 命令智能分析
   - 风险命令识别与确认
   - 安全建议提供

3. **SSH连接管理**
   - 远程连接建立与维护
   - 会话管理
   - 终端交互集成

## 注意事项

1. 代码提交前必须通过所有测试
2. 遵循项目的代码风格指南
3. 保持文档的及时更新
4. 定期同步主分支代码
5. 重要功能需要代码审查
