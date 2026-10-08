(async () => {
  const editor = /\/editor(?:\.html)?\/?$/.test(location.pathname);
  try {
    const response = await fetch('/api/usage', {
      method: editor ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) return;
    const { users } = await response.json();
    const label = document.getElementById('usageCount');
    if (label && Number.isInteger(users)) {
      label.textContent = `已有 ${users.toLocaleString('zh-TW')} 個瀏覽器開始製作`;
      label.hidden = false;
    }
  } catch {
    // Statistics never block the editor.
  }
})();
