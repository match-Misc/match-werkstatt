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
      const logoResponse = await fetch('/src/assets/match-logo.jpg');
      const logoBlob = await logoResponse.blob();
      const logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(logoBlob);
      });
      
      // Logo hinzufügen (oben links, 50x30 px)
      pdf.addImage(logoBase64, 'JPEG', 20, 10, 50, 30);
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

    // Grunddaten
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Grunddaten:', 20, yPosition);
    yPosition += 10;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    
    const basicData = [
      `Kunde: ${this.order.clientName || 'Nicht angegeben'}`,
      `Kostenstelle: ${this.order.costCenter || 'Nicht angegeben'}`,
      `Deadline: ${this.order.deadline ? new Date(this.order.deadline).toLocaleDateString('de-DE') : 'Nicht angegeben'}`,
      `Erstellt am: ${this.order.createdAt ? new Date(this.order.createdAt).toLocaleDateString('de-DE') : 'Nicht verfügbar'}`,
      `Status: ${this.order.status || 'Nicht angegeben'}`,
      `Priorität: ${this.order.priority || 'medium'}`
    ];

    basicData.forEach(line => {
      pdf.text(line, 20, yPosition);
      yPosition += 8;
    });

    yPosition += 10;

    // Beschreibung
    if (this.order.description) {
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Beschreibung:', 20, yPosition);
      yPosition += 10;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      
      const lines = pdf.splitTextToSize(this.order.description, pageWidth - 40);
      pdf.text(lines, 20, yPosition);
      yPosition += lines.length * 6 + 10;
    }

    // Komponenten/Bauteile
    if (this.options.includeComponents && this.order.components && this.order.components.length > 0) {
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
        
        pdf.text(`${index + 1}. ${name} (Anzahl: ${quantity})`, 25, yPosition);
        yPosition += 6;
        
        if (description && description !== 'Keine Beschreibung') {
          const descLines = pdf.splitTextToSize(`   ${description}`, pageWidth - 60);
          pdf.text(descLines, 25, yPosition);
          yPosition += descLines.length * 6;
        }
        yPosition += 4;
      });
      yPosition += 10;
    }

    // Netzlaufwerk-Ordner Information (entfernt, da nicht im Order-Type vorhanden)
    // Stattdessen Auftragstyp und weitere Details
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
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Anhänge:', 20, yPosition);
      yPosition += 10;

      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      
      this.order.documents.forEach((doc: any, index: number) => {
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

      // Deckblatt hinzufügen
      const coverPdfDoc = await PDFDocument.load(coverBytes);
      const coverPages = await pdfDoc.copyPages(coverPdfDoc, [0]);
      coverPages.forEach((page) => pdfDoc.addPage(page));

      // Dokumente hinzufügen
      for (const document of this.order.documents) {
        try {
          await this.addDocumentToMergedPDF(pdfDoc, document, 'Anhang');
        } catch (error) {
          console.warn(`Dokument ${document.name} konnte nicht hinzugefügt werden:`, error);
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
      // Dokument vom Server laden
      const response = await fetch(`/api/orders/${this.order.id}/documents/${document.name}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const docBuffer = await response.arrayBuffer();
      const docPdf = await PDFDocument.load(docBuffer);
      
      const docPages = await pdfDoc.copyPages(docPdf, docPdf.getPageIndices());
      docPages.forEach((page) => pdfDoc.addPage(page));

    } catch (error) {
      console.error(`Fehler beim Hinzufügen des Dokuments ${document.name}:`, error);
      
      // Fallback: Eine Seite mit Fehlermeldung hinzufügen
      const page = pdfDoc.addPage();
      const { height } = page.getSize();
      
      page.drawText(`${documentType}: ${document.name}`, {
        x: 50,
        y: height - 100,
        size: 16,
        color: rgb(0, 0, 0),
      });
      
      page.drawText('Dokument konnte nicht geladen werden.', {
        x: 50,
        y: height - 130,
        size: 12,
        color: rgb(0.7, 0, 0),
      });
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
