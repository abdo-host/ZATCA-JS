const buffer = require('buffer').Buffer;
const QRCode = require('qrcode');

class GenerateQrCode {
    constructor(company_name = '', tax_id = '', invoice_date = '', grand_total = 0.00, tax_total = 0.00) {
        this.company_name = company_name;
        this.tax_id = tax_id;
        this.invoice_date = invoice_date;
        this.grand_total = grand_total;
        this.tax_total = tax_total;
    }

    async getTLV() {
        return this.validateInvoiceData() || await buffer.concat([
            this.getTLVForValue('1', this.company_name),
            this.getTLVForValue('2', String(this.tax_id)),
            this.getTLVForValue('3', String(this.invoice_date)),
            this.getTLVForValue('4', String(this.grand_total)),
            this.getTLVForValue('5', String(this.tax_total)),
        ]);
    }

    async toBase64() {
        return this.validateInvoiceData() || await buffer.concat([
            this.getTLVForValue('1', this.company_name),
            this.getTLVForValue('2', String(this.tax_id)),
            this.getTLVForValue('3', String(this.invoice_date)),
            this.getTLVForValue('4', String(this.grand_total)),
            this.getTLVForValue('5', String(this.tax_total)),
        ]).toString('base64');
    }

    async render(options = {}) {
        const opts = {
            errorCorrectionLevel: 'H',
            type: 'image/jpeg',
            quality: 0.5,
            margin: 2.5,
            color: {
                dark: "#000000",
                light: "#ffffff"
            }
        };
        return new Promise(async (resolve, reject) => {
            QRCode.toDataURL(await this.toBase64(), {...opts, ...options}, function (err, url) {
                if (err) {
                    reject(err);
                } else {
                    resolve(url);
                }
            });
        });
    }

    getTLVForValue(tagNum, tagValue) {
        let tagBuf = buffer.from([tagNum], 'utf8');
        let tagValueLenBuf = buffer.from([tagValue.length], 'utf8');
        let tagValueBuf = buffer.from(tagValue, 'utf8');
        return buffer.concat([tagBuf, tagValueLenBuf, tagValueBuf])
    }

    validateInvoiceData() {
        let error = '';
        if (!this.company_name || !this.company_name.length) {
            return ('<span style="color:#c00">Company name must be not null</span>')
        } else if (!this.tax_id || !this.tax_id.length) {
            return ('<span style="color:#c00">Tax number name must be not null</span>')
        } else if (this.tax_id.length < 15 || /^3.*3$/.test(this.tax_id) == false) {
            return ('<span style="color:#c00">The tax number must consist of 15 digits, where the first and last digits are [3]</span>')
        } else if (!this.invoice_date || !this.invoice_date.length) {
            return ('<span style="color:#c00">Invoice date must be not null</span>')
        } else if (!this.isValidISO8601Date(this.invoice_date)) {
            return ('<span style="color:#c00">Invoice date must be ISO8601 format <a href="https://codepen.io/Abdo-Host/pen/VwVXbVZ" target="_blank"><b>Example</b></a> </span>')
        }
        return false;
    }

    isValidISO8601Date(dateString) {
        if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(dateString)) return false;
        const d = new Date(dateString);
        return d instanceof Date && !isNaN(d.getTime()) && d.toISOString() === dateString; // valid date
    }
}

module.exports = GenerateQrCode;
