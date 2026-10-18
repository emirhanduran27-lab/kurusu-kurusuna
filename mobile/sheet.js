/* Excel dosyalarını (xlsx, xls, ods, Excel'in HTML çıktıları) satırlara çevirir.
   renderer/vendor/sheet.js olarak paketlenir ve sadece ekstre içe aktarılırken yüklenir. */
import { read, utils } from '@e965/xlsx';

window.KKSheet = {
  // Her sayfa için [ [hücre, hücre, ...], ... ] döner. Tarihler Date, sayılar number olarak gelir.
  sheets(buf) {
    const wb = read(buf, { type: 'array', raw: true, cellDates: true, cellFormula: false, cellHTML: false, cellStyles: false, dense: true });
    return wb.SheetNames.map(name => ({ name, rows: utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false }) }));
  }
};
