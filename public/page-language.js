// Shares the homepage's `apl-language` choice. English is the HTML; Chinese is swapped in from #page-zh.
(function () {
  var KEY = 'apl-language';
  var language = 'en';
  try { language = localStorage.getItem(KEY) === 'zh' ? 'zh' : 'en'; } catch (error) {}
  var template = document.getElementById('page-zh');
  var content = document.getElementById('page-content');
  if (language === 'zh' && template && content) {
    content.innerHTML = template.innerHTML;
    document.documentElement.lang = 'zh-CN';
    if (template.dataset.title) document.title = template.dataset.title;
    var description = document.querySelector('meta[name="description"]');
    if (description && template.dataset.description) description.setAttribute('content', template.dataset.description);
  }
  var toggle = document.querySelector('[data-language-toggle]');
  if (toggle) toggle.addEventListener('click', function () {
    try { localStorage.setItem(KEY, language === 'zh' ? 'en' : 'zh'); } catch (error) {}
    location.reload();
  });
})();
