// AIPM 个人导航页 - Apple 极简主义美学

// 模块化数据结构 - 便于后期维护链接
const moduleData = {
  learn: [
    { icon: '🤖', title: 'ChatGPT', desc: '提问、讲解、改写，学习助理', url: 'https://chat.openai.com' },
    { icon: '🌐', title: 'WaytoAGI', desc: 'AI 资讯与教程', url: 'https://waytoagi.com' },
    { icon: '📚', title: 'Prompt Engineering', desc: '提示词工程指南', url: 'https://github.com/dair-ai/Prompt-Engineering-Guide' },
    { icon: '🧠', title: 'Hugging Face', desc: '模型与数据集平台', url: 'https://huggingface.co' },
    { icon: '🎓', title: 'AI 产品经理课程', desc: '系统学习AIPM知识', url: '#' },
    { icon: '📝', title: '备忘录', desc: '记录灵感与要点', url: '#' },
    { icon: '📄', title: '论文阅读', desc: '前沿技术论文', url: 'https://arxiv.org' },
    { icon: '🎥', title: 'AI 视频教程', desc: '深入理解AI概念', url: 'https://www.youtube.com' }
  ],
  lab: [
    { icon: '🧪', title: 'Playground AI', desc: '图像生成实验', url: 'https://playgroundai.com' },
    { icon: '💬', title: 'Chatbot Arena', desc: '模型对比测试', url: 'https://chat.lmsys.org' },
    { icon: '🔧', title: 'LangChain', desc: '构建AI应用框架', url: 'https://langchain.com' },
    { icon: '📊', title: 'Observable', desc: '数据可视化实验', url: 'https://observablehq.com' },
    { icon: '🏗️', title: 'AI Agent Builder', desc: '构建智能代理', url: '#' },
    { icon: '🔬', title: 'Stable Diffusion', desc: '本地模型实验', url: '#' },
    { icon: '🎮', title: 'AI 游戏实验', desc: '游戏AI应用', url: '#' },
    { icon: '🔌', title: 'API 测试工具', desc: '接口调试与测试', url: '#' }
  ],
  write: [
    { icon: '✏️', title: 'Notion', desc: '文档与笔记管理', url: 'https://notion.so' },
    { icon: '📝', title: 'Obsidian', desc: '知识图谱构建', url: 'https://obsidian.md' },
    { icon: '📋', title: 'PRD 模板', desc: '产品需求文档', url: '#' },
    { icon: '🎯', title: 'OKR 工具', desc: '目标管理', url: 'https://www.raycast.com' },
    { icon: '🔍', title: 'Grammarly', desc: '英文写作助手', url: 'https://grammarly.com' },
    { icon: '🧠', title: 'Mind Map', desc: '思维导图工具', url: 'https://miro.com' },
    { icon: '📁', title: '云盘', desc: '文档存储与共享', url: 'https://drive.google.com' },
    { icon: '💬', title: 'Markdown 编辑器', desc: '格式化文档编写', url: '#' }
  ],
  insight: [
    { icon: '📰', title: 'TechCrunch', desc: '科技新闻资讯', url: 'https://techcrunch.com' },
    { icon: '💼', title: 'Product Hunt', desc: '新产品发现', url: 'https://producthunt.com' },
    { icon: '📈', title: 'SimilarWeb', desc: '网站流量分析', url: 'https://similarweb.com' },
    { icon: '🔍', title: 'Crunchbase', desc: '公司数据与融资', url: 'https://crunchbase.com' },
    { icon: '👥', title: '领英', desc: '行业人脉与趋势', url: 'https://linkedin.com' },
    { icon: '📱', title: 'App Store', desc: '竞品分析', url: 'https://apps.apple.com' },
    { icon: '🌐', title: 'Google Trends', desc: '搜索趋势分析', url: 'https://trends.google.com' },
    { icon: '☁️', title: '云盘', desc: '洞察资料库', url: 'https://drive.google.com' }
  ],
  work: [
    { icon: '📧', title: 'Gmail', desc: '邮件管理', url: 'https://gmail.com' },
    { icon: '📅', title: 'Google Calendar', desc: '日程安排', url: 'https://calendar.google.com' },
    { icon: '💬', title: 'Slack', desc: '团队沟通', url: 'https://slack.com' },
    { icon: '📋', title: 'Trello', desc: '项目管理', url: 'https://trello.com' },
    { icon: '📹', title: 'Zoom', desc: '视频会议', url: 'https://zoom.us' },
    { icon: '📊', title: 'Google Sheets', desc: '数据协作', url: 'https://sheets.google.com' },
    { icon: '📄', title: 'Resume Builder', desc: '简历优化', url: '#' },
    { icon: '💼', title: '求职平台', desc: '职位搜索', url: 'https://www.linkedin.com/jobs' }
  ]
};

// 激活指定的 tab
function activateTab(tabName) {
  // 隐藏所有内容区域
  const sections = document.querySelectorAll('.content-section');
  sections.forEach(section => {
    section.classList.remove('active');
  });
  
  // 显示目标内容区域
  const targetSection = document.getElementById(`${tabName}-section`);
  if (targetSection) {
    targetSection.classList.add('active');
  }
  
  // 更新 dock 状态
  const dockItems = document.querySelectorAll('.dock-item');
  dockItems.forEach(item => {
    item.classList.remove('active');
    if (item.dataset.tab === tabName) {
      item.classList.add('active');
    }
  });
  
  // 如果是首次访问某个模块，动态生成卡片
  if (['learn', 'lab', 'write', 'insight', 'work'].includes(tabName)) {
    generateModuleCards(tabName);
  }
}

// 生成模块卡片
function generateModuleCards(moduleName) {
  const container = document.querySelector(`#${moduleName}-section .grid-container`);
  if (!container || container.children.length > 0) return; // 如果已有内容则不重复生成
  
  const moduleCards = moduleData[moduleName];
  if (!moduleCards) return;
  
  moduleCards.forEach(cardData => {
    const card = document.createElement('div');
    card.className = cardData.url === '#' ? 'card card-placeholder' : 'card';
    card.innerHTML = `
      <div class="card-icon">${cardData.icon}</div>
      <h3 class="card-title">${cardData.title}</h3>
      <p class="card-desc">${cardData.desc}</p>
    `;
    
    if (cardData.url !== '#') {
      card.onclick = () => openLink(cardData.url);
    }
    
    container.appendChild(card);
  });
}

// 打开链接
function openLink(url) {
  if (url) {
    window.open(url, '_blank');
  }
}

// 执行 Google 搜索
function performGoogleSearch() {
  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    const query = searchInput.value.trim();
    if (query) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      window.open(searchUrl, '_blank');
    }
  }
}

// 设置全局搜索功能
function setupGlobalSearch() {
  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        performGoogleSearch();
      }
    });
  }
}

// 更新动态时间
function updateDynamicTime() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = weekdays[now.getDay()];
  
  const dateString = `${month}月${day}日 ${weekday}`;
  const timeString = `${hours}:${minutes}:${seconds}`;
  
  document.getElementById('date-display').textContent = dateString;
  document.getElementById('clock-display').textContent = timeString;
}

// 设置 Dock 点击事件
function setupDockNavigation() {
  const dockItems = document.querySelectorAll('.dock-item');
  dockItems.forEach(item => {
    item.addEventListener('click', function() {
      const tabName = this.dataset.tab;
      activateTab(tabName);
    });
  });
}

// 初始化应用
function initApp() {
  // 初始化动态时间
  updateDynamicTime();
  setInterval(updateDynamicTime, 1000); // 每秒更新一次时间
  
  // 设置全局搜索
  setupGlobalSearch();
  
  // 设置 Dock 导航
  setupDockNavigation();
  
  // 默认激活首页 tab
  activateTab('home');
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initApp);