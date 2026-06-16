import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { PDFDocument, rgb } from 'pdf-lib';
import { Order } from '../types';

export interface OrderPrintOptions {
  includeDocuments: boolean;
  includeComponents: boolean;
  includeQRCode: boolean;
}

export class OrderPDFGenerator {
  private order: Order;
  private options: OrderPrintOptions;

  constructor(order: Order, options: OrderPrintOptions = {
    includeDocuments: true,
    includeComponents: true,
    includeQRCode: true
  }) {
    this.order = order;
    this.options = options;
  }

  private async generateQRCode(text: string): Promise<string> {
    try {
      // Generate a full URL for the order that can be opened directly
      const baseUrl = window.location.origin;
      const orderUrl = `${baseUrl}/#/order/${text}`;
      
      // QR-Code mit der vollständigen URL generieren
      const qrCodeDataURL = await QRCode.toDataURL(orderUrl, {
        errorCorrectionLevel: 'M',
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 200
      });
      return qrCodeDataURL;
    } catch (error) {
      console.error('Error generating QR code:', error);
      // Fallback QR-Code nur mit Order-ID
      return await QRCode.toDataURL(text);
    }
  }

  async generatePDF(): Promise<jsPDF> {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();

    // Logo oben links hinzufügen
    try {
      // Logo als Base64 laden
      const logoResponse = await fetch('/src/assets/match_Logo_2023.png');
      const logoBlob = await logoResponse.blob();
      const logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(logoBlob);
      });
      
      // Logo-Eigenschaften auslesen um es proportional zu skalieren
      const imgProps = pdf.getImageProperties(logoBase64);
      let imgWidth = 50;
      let imgHeight = (imgProps.height * imgWidth) / imgProps.width;
      
      // Wenn es höher als 30px wird, nach Höhe skalieren
      if (imgHeight > 30) {
        imgHeight = 30;
        imgWidth = (imgProps.width * imgHeight) / imgProps.height;
      }
      
      // Logo hinzufügen (oben links, max 50x30 px, nicht gestaucht)
      pdf.addImage(logoBase64, 'PNG', 20, 10, imgWidth, imgHeight);
    } catch (error) {
      console.warn('Logo konnte nicht geladen werden:', error);
      // Fallback: "MATCH" Text als Logo-Ersatz
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('MATCH', 20, 25);
    }

    // Header mit QR-Code (rechts oben)
    if (this.options.includeQRCode) {
      const qrCodeData = await this.generateQRCode(this.order.orderNumber || this.order.id);
      pdf.addImage(qrCodeData, 'PNG', pageWidth - 80, 10, 70, 70);
    }

    // Auftragsnummer (ohne "WERKSTATTAUFTRAG" Titel)
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Auftragsnummer: ${this.order.orderNumber || this.order.id}`, 20, 50);

    let yPosition = 70;

    const checkPageBreak = (requiredHeight: number) => {
      if (yPosition + requiredHeight > 280) {
        pdf.addPage();
        yPosition = 20; // Top margin for new pages
      }
    };

    const basicData = [
      `Kunde: ${this.order.clientName || 'Nicht angegeben'}`,
      `Kostenstelle: ${this.order.costCenter || 'Nicht angegeben'}`,
      `Deadline: ${this.order.deadline ? new Date(this.order.deadline).toLocaleDateString('de-DE') : 'Nicht angegeben'}`,
      `Erstellt am: ${this.order.createdAt ? new Date(this.order.createdAt).toLocaleDateString('de-DE') : 'Nicht verfügbar'}`,
      `Status: ${this.order.status || 'Nicht angegeben'}`,
      `Priorität: ${this.order.priority || 'medium'}`
    ];

    // Grunddaten
    checkPageBreak(10 + basicData.length * 8 + 10);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Grunddaten:', 20, yPosition);
    yPosition += 10;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    
    basicData.forEach(line => {
      pdf.text(line, 20, yPosition);
      yPosition += 8;
    });

    yPosition += 10;

    // Beschreibung
    if (this.order.description) {
      const lines = pdf.splitTextToSize(this.order.description, pageWidth - 40);
      checkPageBreak(10 + lines.length * 6 + 10);
      
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Beschreibung:', 20, yPosition);
      yPosition += 10;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      
      pdf.text(lines, 20, yPosition);
      yPosition += lines.length * 6 + 10;
    }

    // Komponenten/Bauteile
    if (this.options.includeComponents && this.order.components && this.order.components.length > 0) {
      checkPageBreak(15);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Komponenten/Bauteile:', 20, yPosition);
      yPosition += 10;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');

      this.order.components.forEach((component: any, index: number) => {
        const name = component.name || component.title || `Komponente ${index + 1}`;
        const description = component.description || 'Keine Beschreibung';
        const quantity = component.quantity || 1;
        
        const descLines = description && description !== 'Keine Beschreibung' ? pdf.splitTextToSize(`   ${description}`, pageWidth - 60) : [];
        const requiredHeight = 6 + (descLines.length * 6) + 4;
        
        checkPageBreak(requiredHeight);
        
        pdf.text(`${index + 1}. ${name} (Anzahl: ${quantity})`, 25, yPosition);
        yPosition += 6;
        
        if (descLines.length > 0) {
          pdf.text(descLines, 25, yPosition);
          yPosition += descLines.length * 6;
        }
        yPosition += 4;
      });
      yPosition += 10;
    }

    // Netzlaufwerk-Ordner Information (entfernt, da nicht im Order-Type vorhanden)
    // Stattdessen Auftragstyp und weitere Details
    // Weitere Details
    const actualHoursHeight = this.order.actualHours ? 8 : 0;
    checkPageBreak(10 + 8 + 8 + actualHoursHeight + 10);
    
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Weitere Details:', 20, yPosition);
    yPosition += 10;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Auftragstyp: ${this.order.orderType || 'Nicht angegeben'}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Geschätzte Stunden: ${this.order.estimatedHours || 0}`, 20, yPosition);
    yPosition += 8;
    if (this.order.actualHours) {
      pdf.text(`Tatsächliche Stunden: ${this.order.actualHours}`, 20, yPosition);
      yPosition += 8;
    }
    yPosition += 10;

    // Dokumente
    if (this.options.includeDocuments && this.order.documents && this.order.documents.length > 0) {
      checkPageBreak(15);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Anhänge:', 20, yPosition);
      yPosition += 10;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      
      this.order.documents.forEach((doc: any, index: number) => {
        checkPageBreak(8);
        const fileName = doc.name || `Dokument ${index + 1}`;
        pdf.text(`${index + 1}. ${fileName}`, 25, yPosition);
        yPosition += 8;
      });
    }

    return pdf;
  }

  async generateCombinedPDF(): Promise<Blob> {
    if (!this.options.includeDocuments || !this.order.documents || this.order.documents.length === 0) {
      // Nur das Deckblatt generieren
      const pdf = await this.generatePDF();
      return new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
    }

    try {
      // Deckblatt erstellen
      const coverPdf = await this.generatePDF();
      const coverBytes = coverPdf.output('arraybuffer');

      // Neues PDF-Dokument erstellen
      const pdfDoc = await PDFDocument.create();

      // Deckblatt hinzufügen (können mittlerweile mehrere Seiten sein)
      const coverPdfDoc = await PDFDocument.load(coverBytes);
      const pageIndices = Array.from({ length: coverPdfDoc.getPageCount() }, (_, i) => i);
      const coverPages = await pdfDoc.copyPages(coverPdfDoc, pageIndices);
      coverPages.forEach((page) => pdfDoc.addPage(page));

      // Dokumente hinzufügen
      for (const document of this.order.documents) {
        try {
          await this.addDocumentToMergedPDF(pdfDoc, document, 'Anhang');
        } catch (error) {
          console.warn(`Dokument ${document.name} konnte nicht hinzugefügt werden:`, error);
        }
      }

      // Komponenten-Dokumente hinzufügen
      if (this.options.includeComponents && this.order.components) {
        for (const component of this.order.components) {
          if (component.documents && component.documents.length > 0) {
            for (const doc of component.documents) {
              try {
                await this.addDocumentToMergedPDF(pdfDoc, doc, `Bauteil: ${component.title || component.name}`);
              } catch (error) {
                console.warn(`Bauteil-Dokument ${doc.name} konnte nicht hinzugefügt werden:`, error);
              }
            }
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      return new Blob([pdfBytes], { type: 'application/pdf' });

    } catch (error) {
      console.error('Fehler beim Erstellen des kombinierten PDFs:', error);
      // Fallback: Nur das Deckblatt zurückgeben
      const pdf = await this.generatePDF();
      return new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
    }
  }

  private async addDocumentToMergedPDF(pdfDoc: PDFDocument, document: any, documentType: string): Promise<void> {
    try {
      if (!document.name || !document.name.toLowerCase().endsWith('.pdf')) {
        // Skip non-PDF files completely (like .stl, .ipt)
        return;
      }

      // Construct correct API path (prioritize document.id if available)
      let fetchUrl = '';
      if (document.id) {
        fetchUrl = `/api/documents/${document.id}`;
      } else if (this.order.id && document.name) {
        fetchUrl = `/api/orders/${this.order.id}/files/${encodeURIComponent(document.name)}`;
      } else if (document.url) {
        fetchUrl = document.url;
      }

      if (!fetchUrl) {
        throw new Error('No valid URL found for document');
      }

      const response = await fetch(fetchUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const docBuffer = await response.arrayBuffer();
      
      // We load the source document to copy its pages in their original size
      const sourcePdfDoc = await PDFDocument.load(docBuffer);
      const copiedPages = await pdfDoc.copyPages(sourcePdfDoc, sourcePdfDoc.getPageIndices());
      
      copiedPages.forEach((page, index) => {
        pdfDoc.addPage(page);
        
        if (index === 0) {
          const { height } = page.getSize();
          // Write the document name at the top left of the first page
          page.drawText(`${documentType}: ${document.name}`, {
            x: 40,
            y: height - 30,
            size: 18,
            color: rgb(0.2, 0.2, 0.2),
          });
        }
      });

    } catch (error) {
      console.error(`Fehler beim Hinzufügen des Dokuments ${document.name}:`, error);
      // We no longer add a fallback error page. If it fails, we simply skip it.
    }
  }

  async downloadPDF(filename?: string): Promise<void> {
    try {
      const pdfBlob = await this.generateCombinedPDF();
      const url = URL.createObjectURL(pdfBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || `Auftrag_${this.order.orderNumber || this.order.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Fehler beim Herunterladen des PDFs:', error);
      throw error;
    }
  }

  async generatePreviewURL(): Promise<string> {
    try {
      const pdfBlob = await this.generateCombinedPDF();
      return URL.createObjectURL(pdfBlob);
    } catch (error) {
      console.error('Fehler beim Erstellen der PDF-Vorschau:', error);
      throw error;
    }
  }
}

export default OrderPDFGenerator;
