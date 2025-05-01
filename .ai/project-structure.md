# InfinityOps 项目结构

## 目录结构

```
infinityops/
├── apps/                      # 应用程序目录
│   ├── web/                   # 前端应用
│   │   ├── src/
│   │   │   ├── components/    # React 组件
│   │   │   │   ├── terminal/  # 终端相关组件
│   │   │   │   ├── ai/       # AI 相关组件
│   │   │   │   ├── plugins/  # 插件相关组件
│   │   │   │   └── common/   # 通用组件
│   │   │   ├── hooks/        # 自定义 Hooks
│   │   │   ├── services/     # 服务层
│   │   │   ├── stores/       # 状态管理
│   │   │   ├── types/        # TypeScript 类型定义
│   │   │   └── utils/        # 工具函数
│   │   ├── public/           # 静态资源
│   │   └── package.json      # 前端依赖配置
│   │
│   └── server/               # 后端应用
│       ├── src/
│       │   ├── modules/      # 功能模块
│       │   │   ├── ssh/      # SSH 模块
│       │   │   ├── ai/       # AI 模块
│       │   │   ├── mcp/      # MCP 模块
│       │   │   └── plugins/  # 插件模块
│       │   ├── services/     # 服务层
│       │   ├── types/        # TypeScript 类型定义
│       │   └── utils/        # 工具函数
│       └── package.json      # 后端依赖配置
│
├── packages/                  # 共享包
│   ├── types/                # 共享类型定义
│   ├── utils/                # 共享工具函数
│   └── config/               # 共享配置
│
├── docs/                     # 文档目录
│   ├── api/                  # API 文档
│   ├── guides/               # 使用指南
│   └── development/          # 开发文档
│
├── scripts/                  # 脚本目录
│   ├── setup/               # 环境设置脚本
│   ├── build/               # 构建脚本
│   └── deploy/              # 部署脚本
│
├── config/                   # 配置文件目录
│   ├── webpack/             # Webpack 配置
│   ├── typescript/          # TypeScript 配置
│   └── eslint/              # ESLint 配置
│
├── tests/                    # 测试目录
│   ├── unit/                # 单元测试
│   ├── integration/         # 集成测试
│   └── e2e/                 # 端到端测试
│
├── .github/                  # GitHub 配置
│   └── workflows/           # GitHub Actions 工作流
│
├── .vscode/                  # VS Code 配置
├── .gitignore               # Git 忽略文件
├── package.json             # 项目根配置
├── pnpm-workspace.yaml      # pnpm 工作空间配置
├── tsconfig.json            # TypeScript 根配置
└── README.md                # 项目说明文档
```

## 开发环境要求

### 系统要求
- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Git >= 2.0.0

### 开发工具
- VS Code（推荐）
- Git
- Docker（可选，用于开发环境）

## 初始化步骤

1. 克隆项目
```bash
git clone https://github.com/your-org/infinityops.git
cd infinityops
```

2. 安装依赖
```bash
pnpm install
```

3. 设置开发环境
```bash
pnpm run setup
```

4. 启动开发服务器
```bash
pnpm run dev
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
# 开发环境构建
pnpm run build:dev

# 生产环境构建
pnpm run build:prod
```

### 5. 部署流程
```bash
# 开发环境部署
pnpm run deploy:dev

# 生产环境部署
pnpm run deploy:prod
```

## 注意事项

1. 代码提交前必须通过所有测试
2. 遵循项目的代码风格指南
3. 保持文档的及时更新
4. 定期同步主分支代码
5. 重要功能需要代码审查
