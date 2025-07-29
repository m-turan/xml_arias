const xml2js = require('xml2js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class XMLConverter {
    constructor() {
        this.parser = new xml2js.Parser({
            explicitArray: false,
            mergeAttrs: false,
            attrkey: '$'
        });
        this.builder = new xml2js.Builder();
    }

    async getXMLContent(source) {
        try {
            let xmlData;
            if (source.startsWith('http://') || source.startsWith('https://')) {
                const response = await axios.get(source);
                xmlData = response.data;
            } else {
                xmlData = await fs.promises.readFile(source, 'utf8');
            }
            return xmlData;
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('Dosya bulunamadı');
            }
            throw new Error(`XML verisi alınamadı: ${error.message}`);
        }
    }

    async parseXML(xmlString) {
        try {
            return await this.parser.parseStringPromise(xmlString);
        } catch (error) {
            throw new Error(`XML ayrıştırma hatası: ${error.message}`);
        }
    }

    async convertToTemplate(source) {
        try {
            const xmlData = await this.getXMLContent(source);
            const parsed = await this.parseXML(xmlData);
            const converted = this.transformXML(parsed);
            return this.builder.buildObject(converted);
        } catch (error) {
            throw new Error(`Dönüştürme hatası: ${error.message}`);
        }
    }

    transformXML(parsed) {
        const products = {
            products: {
                product: []
            }
        };

        if (parsed.Root && parsed.Root.Urunler && parsed.Root.Urunler.Urun) {
            const sourceProducts = Array.isArray(parsed.Root.Urunler.Urun) 
                ? parsed.Root.Urunler.Urun 
                : [parsed.Root.Urunler.Urun];

            products.products.product = sourceProducts.map(urun => {
                const product = {
                    id: urun.UrunKartiID || '',
                    productCode: '',
                    barcode: '',
                    main_category: {
                        '_': urun.KategoriTree ? urun.KategoriTree.split('/')[0] : ''
                    },
                    top_category: {
                        '_': urun.KategoriTree ? urun.KategoriTree.split('/')[1] || '' : ''
                    },
                    sub_category: {
                        '_': urun.Kategori || ''
                    },
                    sub_category_: {
                        '_': ''
                    },
                    categoryID: urun.KategoriID || '',
                    category: {
                        '_': urun.KategoriTree ? urun.KategoriTree.replace(/\//g, ' >>> ') : ''
                    },
                    active: urun.Aktif === 'Evet' ? '1' : '0',
                    brandID: urun.MarkaID || '',
                    brand: {
                        '_': urun.Marka || ''
                    },
                    name: {
                        '_': urun.UrunAdi || ''
                    },
                    description: {
                        '_': urun.Aciklama || ''
                    },
                    variants: {
                        variant: []
                    }
                };

                if (urun.Resimler && urun.Resimler.Resim) {
                    const resimler = Array.isArray(urun.Resimler.Resim) 
                        ? urun.Resimler.Resim 
                        : [urun.Resimler.Resim];

                    resimler.forEach((resim, index) => {
                        product[`image${index + 1}`] = resim;
                    });
                }

                if (urun.UrunSecenek && urun.UrunSecenek.Secenek) {
                    const secenekler = Array.isArray(urun.UrunSecenek.Secenek) 
                        ? urun.UrunSecenek.Secenek 
                        : [urun.UrunSecenek.Secenek];

                    if (secenekler[0]) {
                        product.listPrice = secenekler[0].SatisFiyati || '';
                        product.price = secenekler[0].AlisFiyati || '';
                        product.tax = secenekler[0].KdvOrani ? (secenekler[0].KdvOrani / 100).toString() : '';
                        product.currency = 'TRY';
                        product.desi = secenekler[0].Desi || '';
                        product.productCode = secenekler[0].StokKodu || '';
                    }

                    product.variants.variant = secenekler.map(secenek => {
                        let renk = '';
                        let beden = '';

                        if (secenek.EkSecenekOzellik && secenek.EkSecenekOzellik.Ozellik) {
                            const ozellikler = Array.isArray(secenek.EkSecenekOzellik.Ozellik)
                                ? secenek.EkSecenekOzellik.Ozellik
                                : [secenek.EkSecenekOzellik.Ozellik];

                            for (const ozellik of ozellikler) {
                                if (ozellik.$ && ozellik.$.Tanim) {
                                    const tanim = ozellik.$.Tanim.toUpperCase();
                                    if (tanim === 'BEDEN' || tanim.includes('BEDEN')) {
                                        beden = ozellik.$.Deger || ozellik._ || '';
                                    } else if (tanim === 'RENK') {
                                        renk = ozellik.$.Deger || ozellik._ || '';
                                    }
                                }
                            }
                        }

                        return {
                            name1: 'Renk',
                            value1: renk,
                            name2: 'Beden',
                            value2: beden,
                            quantity: secenek.StokAdedi || '0',
                            barcode: secenek.Barkod || ''
                        };
                    });

                    product.quantity = product.variants.variant.reduce((total, variant) => 
                        total + parseInt(variant.quantity || 0), 0).toString();
                }

                return product;
            });
        }

        return products;
    }

    async saveToFile(xmlString, filePath) {
        try {
            await fs.promises.writeFile(filePath, xmlString);
            return filePath;
        } catch (error) {
            throw new Error(`Dosya kaydetme hatası: ${error.message}`);
        }
    }
}

module.exports = new XMLConverter();