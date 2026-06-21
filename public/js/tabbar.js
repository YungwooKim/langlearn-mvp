// 하단 탭바 공통 컴포넌트 (4탭)
export function renderTabbar(active) {
  const tabs = [
    { id: 'home',        icon: '🏠', label: '홈',     href: '/home.html' },
    { id: 'lectures',    icon: '📚', label: '강의목록', href: '/lectures.html' },
    { id: 'my-lectures', icon: '🎓', label: '내 강의',  href: '/my-lectures.html' },
    { id: 'settings',    icon: '⚙️', label: '설정',   href: '/settings.html' }
  ];

  const bar = document.createElement('nav');
  bar.className = 'tabbar';
  bar.innerHTML = tabs.map(t => `
    <a href="${t.href}" class="tab-item ${t.id === active ? 'active' : ''}">
      <span class="tab-icon">${t.icon}</span>
      <span class="tab-label">${t.label}</span>
    </a>
  `).join('');

  document.body.appendChild(bar);
  document.body.classList.add('has-tabbar');
}
