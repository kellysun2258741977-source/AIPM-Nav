// AIPM 个人导航页 - 重构版脚本

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
  
  // 更新 tab 状态
  const tabItems = document.querySelectorAll('.tab-item');
  tabItems.forEach(item => {
    item.classList.remove('active');
    if (item.dataset.tab === tabName) {
      item.classList.add('active');
    }
  });
}

// 打开链接
function openLink(url) {
  if (url) {
    window.open(url, '_blank');
  }
}

// 设置全局搜索功能
function setupGlobalSearch() {
  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
          // 简单的搜索逻辑：如果是网址就直接打开，否则使用 Google 搜索
          if (isValidUrl(query)) {
            window.open(query, '_blank');
          } else {
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            window.open(searchUrl, '_blank');
          }
        }
      }
    });
  }
}

// 检查是否为有效 URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// 设置 Tab 点击事件
function setupTabNavigation() {
  const tabItems = document.querySelectorAll('.tab-item');
  tabItems.forEach(item => {
    item.addEventListener('click', function() {
      const tabName = this.dataset.tab;
      activateTab(tabName);
    });
  });
}

// 设置卡片悬停效果
function setupCardHoverEffects() {
  const cards = document.querySelectorAll('.card:not(.card-placeholder)');
  cards.forEach(card => {
    card.addEventListener('mouseenter', function() {
      this.style.transform = 'scale(1.03)';
    });
    
    card.addEventListener('mouseleave', function() {
      this.style.transform = 'scale(1)';
    });
  });
}

// 初始化应用
function initApp() {
  // 设置全局搜索
  setupGlobalSearch();
  
  // 设置 Tab 导航
  setupTabNavigation();
  
  // 设置卡片悬停效果
  setupCardHoverEffects();
  
  // 默认激活首页 tab
  activateTab('home');
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initApp);