/* PDF rapor için pdf-lib ve Türkçe karakterleri içeren Inter yazı tipi.
   renderer/vendor/pdf.js olarak paketlenir ve sadece rapor oluşturulurken yüklenir. */
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import regular from './fonts/Inter-Regular.ttf';
import bold from './fonts/Inter-SemiBold.ttf';

window.KKPdf = { PDFDocument, rgb, fontkit, fonts: { regular, bold } };
