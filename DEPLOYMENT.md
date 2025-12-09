# 🚀 GitHub Actions 自动部署指南

本项目已配置 GitHub Actions 自动化部署,当代码推送到 `main` 分支时会自动触发部署流程。

## 📋 部署流程

当你推送代码到 `main` 分支时,会自动执行以下步骤:

1. ✅ 检出最新代码
2. 🔐 通过 SSH 连接到部署服务器
3. 📥 在服务器上拉取最新代码 (`git pull origin main`)
4. 🐳 执行 `./deploy.sh` 脚本(Docker Compose 构建和部署)
5. ✅ 部署完成,应用运行在 `http://localhost:4000`

## 🔧 首次配置步骤

### 1. 生成 SSH 密钥对(如果还没有)

在你的**本地机器**上执行:

```bash
# 生成新的 SSH 密钥对
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy_key

# 这会生成两个文件:
# - ~/.ssh/github_deploy_key (私钥,用于 GitHub Secrets)
# - ~/.ssh/github_deploy_key.pub (公钥,用于服务器)
```

### 2. 配置服务器

在你的**部署服务器**上执行:

```bash
# 将公钥添加到服务器的 authorized_keys
cat ~/.ssh/github_deploy_key.pub >> ~/.ssh/authorized_keys

# 设置正确的权限
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh

# 测试 SSH 连接(从本地机器)
ssh -i ~/.ssh/github_deploy_key user@your-server-ip
```

### 3. 配置 GitHub Secrets

在 GitHub 仓库页面:

1. 进入 **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**,添加以下 Secrets:

#### 必需的 Secrets:

| Secret 名称 | 说明 | 示例值 |
|------------|------|--------|
| `SERVER_HOST` | 服务器 IP 或域名 | `123.456.78.90` 或 `example.com` |
| `SERVER_USER` | SSH 登录用户名 | `root` 或 `ubuntu` |
| `SSH_PRIVATE_KEY` | SSH 私钥内容 | 复制 `~/.ssh/github_deploy_key` 的**完整内容** |
| `DEPLOY_PATH` | 项目在服务器上的路径 | `/home/user/github/e-ppt/app` |

#### 可选的 Secrets:

| Secret 名称 | 说明 | 默认值 |
|------------|------|--------|
| `SERVER_PORT` | SSH 端口 | `22` |

### 4. 获取 SSH 私钥内容

在**本地机器**上执行:

```bash
# 查看私钥内容
cat ~/.ssh/github_deploy_key

# 复制输出的完整内容(包括 -----BEGIN ... 和 -----END ... 行)
# 粘贴到 GitHub 的 SSH_PRIVATE_KEY Secret 中
```

**⚠️ 重要**: 确保复制的是**私钥**(`github_deploy_key`),不是公钥(`.pub`)!

### 5. 验证配置

#### 方法一: 推送代码触发部署

```bash
# 在本地仓库执行
git add .
git commit -m "test: trigger GitHub Actions deployment"
git push origin main
```

#### 方法二: 手动触发工作流

1. 在 GitHub 仓库页面,进入 **Actions** 选项卡
2. 选择 **Deploy to Server** 工作流
3. 点击 **Run workflow** → **Run workflow**

### 6. 查看部署日志

1. 进入 GitHub 仓库的 **Actions** 选项卡
2. 点击最新的工作流运行记录
3. 查看 **deploy** 任务的日志输出

## 📝 常见问题排查

### ❌ 问题 1: SSH 连接失败

**错误信息**: `Permission denied (publickey)`

**解决方案**:
```bash
# 1. 检查公钥是否正确添加到服务器
cat ~/.ssh/authorized_keys | grep "github-actions-deploy"

# 2. 检查 SSH 服务配置
sudo nano /etc/ssh/sshd_config
# 确保以下配置启用:
# PubkeyAuthentication yes
# AuthorizedKeysFile .ssh/authorized_keys

# 3. 重启 SSH 服务
sudo systemctl restart sshd
```

### ❌ 问题 2: 找不到项目目录

**错误信息**: `cd: /path/to/project: No such file or directory`

**解决方案**:
```bash
# 1. 在服务器上确认项目路径
pwd  # 在项目目录执行,获取完整路径

# 2. 更新 GitHub Secret: DEPLOY_PATH
# 设置为正确的绝对路径,例如: /home/ubuntu/e-ppt/app
```

### ❌ 问题 3: Git pull 失败

**错误信息**: `Permission denied` 或 `Authentication failed`

**解决方案**:
```bash
# 1. 确保服务器有权限访问 GitHub 仓库
# 如果是私有仓库,需要配置 Deploy Key 或 Personal Access Token

# 方法 A: 使用 Deploy Key (推荐)
# 在服务器生成密钥
ssh-keygen -t ed25519 -C "server-deploy-key" -f ~/.ssh/deploy_key

# 将公钥添加到 GitHub 仓库
# Settings → Deploy keys → Add deploy key
cat ~/.ssh/deploy_key.pub

# 配置 Git 使用该密钥
git config core.sshCommand "ssh -i ~/.ssh/deploy_key"

# 方法 B: 使用 HTTPS + Token
git remote set-url origin https://TOKEN@github.com/username/repo.git
```

### ❌ 问题 4: Docker 权限问题

**错误信息**: `permission denied while trying to connect to the Docker daemon`

**解决方案**:
```bash
# 将用户添加到 docker 组
sudo usermod -aG docker $USER

# 重新登录生效,或立即生效:
newgrp docker

# 测试 Docker 命令
docker ps
```

### ❌ 问题 5: deploy.sh 执行失败

**错误信息**: `Permission denied: ./deploy.sh`

**解决方案**:
```bash
# 确保脚本有执行权限
chmod +x deploy.sh

# 提交修改
git add deploy.sh
git commit -m "fix: add execute permission to deploy.sh"
git push origin main
```

## 🔐 安全建议

1. **限制 SSH 密钥权限**: 生成的 SSH 密钥仅用于部署,不要赋予过高权限
2. **使用专用部署用户**: 创建一个专门用于部署的用户,而不是使用 root
3. **限制 IP 访问**: 在服务器防火墙中限制只允许 GitHub Actions IP 访问(可选)
4. **定期更新密钥**: 建议每 3-6 个月更换一次 SSH 密钥

## 📊 部署监控

### 查看应用状态

```bash
# SSH 登录到服务器后
cd /path/to/project

# 查看 Docker 容器状态
docker compose ps

# 查看容器日志
docker compose logs -f

# 查看最近 100 行日志
docker compose logs --tail=100
```

### 访问应用

部署完成后,应用会运行在:
- 本地: http://localhost:4000
- 远程: http://your-server-ip:4000

## 🛠️ 高级配置

### 添加环境变量

如果你的应用需要环境变量,可以在服务器上创建 `.env` 文件:

```bash
cd /path/to/project
nano .env
```

示例 `.env` 文件:
```env
# API Keys
OPENAI_API_KEY=sk-xxx
BIZYAIR_API_KEY=xxx

# 应用配置
NODE_ENV=production
PORT=4000
```

### 自定义部署流程

如果需要修改部署流程,编辑 [.github/workflows/deploy.yml](.github/workflows/deploy.yml):

```yaml
# 添加构建前的步骤
- name: 运行测试
  run: npm test

# 添加部署后的步骤
- name: 健康检查
  run: curl -f http://localhost:4000/api/health || exit 1
```

## 📞 需要帮助?

如果遇到问题:
1. 查看 GitHub Actions 日志获取详细错误信息
2. 检查服务器上的 Docker 日志: `docker compose logs`
3. 参考本文档的"常见问题排查"部分

---

**部署工作流文件**: [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
**部署脚本**: [deploy.sh](deploy.sh)
