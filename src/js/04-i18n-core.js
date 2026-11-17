/* ===== i18n core ===== */
const I18N = { dict: {} };
I18N.setLang = function (lang) {
  if (lang !== 'fa' && lang !== 'en') lang = 'fa';
  I18N.current = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
};
I18N.getLang = function () { return I18N.current || 'fa'; };
I18N.t = function (key, params) {
  let s = (I18N.dict[I18N.getLang()] && I18N.dict[I18N.getLang()][key]) || (I18N.dict.fa && I18N.dict.fa[key]) || key;
  if (params) for (const k in params) s = s.split('{' + k + '}').join(params[k]);
  return s;
};
const t = I18N.t;
