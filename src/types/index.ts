export interface User {
  id: string;
  username: string;
  role: 'client' | 'workshop' | 'admin';
  name: string;
  password?: string;
}

export interface PDFDocument {
  id: string;
  name: string;
  url: string;
  uploadDate: Date;
  file?: File;
}

export interface RevisionComment {
  comment: string;
  userId: string;
  userName: string;
  createdAt: string; // ISO-String
}

export interface ReworkComment {
  comment: string;
  userId: string;
  userName: string;
  documents: PDFDocument[];
  createdAt: string; // War vorher requestedAt
}

export interface NoteHistory {
  id: string;
  notes: string;
  createdAt: string; // ISO-String
}

export interface Image {
  filename: string;
  contentType: string;
  uploadedAt: string;
  hasImage: boolean;
}

export interface Order {
  id: string;
  orderNumber?: string; // Auftragsnummer (F-250707-1, etc.)
  title: string;
  description: string;
  clientId: string;
  clientName: string;
  deadline: Date;
  costCenter: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'accepted' | 'in_progress' | 'revision' | 'rework' | 'completed' | 'archived' | 'waiting_confirmation';
  documents: PDFDocument[];
  components: Component[]; // Neue Bauteile
  estimatedHours: number;
  actualHours: number;
  assignedTo: string | null;
  notes: string;
  internalWorkshopNote?: string;
  createdAt: Date;
  updatedAt: Date;
  subTasks: SubTask[];
  canEdit?: boolean; // For revision state
  confirmationNote?: string; // Endabnahme-Kommentar vom Kunden
  confirmationDate?: Date;   // Wann bestätigt
  // Materialstatus
  materialOrderedByWorkshop?: boolean; // Material von der Werkstatt bestellt
  materialOrderedByClient?: boolean;   // Material durch den Kunden bestellt (MUSS bestellt werden)
  materialOrderedByClientConfirmed?: boolean; // Kunde bestätigt, dass Material bestellt wurde
  materialAvailable?: boolean;         // Material vorhanden
  revisionRequest?: {
    description: string;
    newDeadline?: Date;
    documents?: PDFDocument[];
    requestedAt: Date;
  };
  orderType: 'fertigung' | 'service'; // Auftragstyp für Nummerngenerierung
  revisionHistory: RevisionComment[];
  reworkComments: ReworkComment[];
  noteHistory: NoteHistory[];
  titleImage?: Image | null; 
  titleImageId?: string | null;
}

export interface SubTask {
  id: string;
  orderId: string;
  title: string;
  description: string;
  estimatedHours: number;
  actualHours: number;
  status: 'pending' | 'in_progress' | 'completed';
  assignedTo: string | null; // Mitarbeiter-ID (Pflicht)
  scopeType: 'order' | 'component'; // Scope: Gesamtauftrag oder Bauteil
  assignedComponentId?: string | null; // ID des zugewiesenen Bauteils (nur bei scopeType='component')
  assignedComponentTitle?: string | null;
  notes: string;
  documents: PDFDocument[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkshopAccount {
  id: string;
  username: string;
  password: string;
  name: string;
  role: 'workshop' | 'admin';
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ClientAccount {
  id: string;
  username: string;
  password: string;
  name: string;
  company?: string;
  email?: string;
  isActive: boolean;
  isApproved: boolean; // Muss von Admin bestätigt werden
  createdAt: Date;
}

export interface Component {
  id: string;
  title: string;
  description: string;
  quantity: number;
  material?: string;
  notes?: string;
  documents: PDFDocument[];
}

export interface ComponentDocument {
  id: string;
  name: string;
  url: string;
  uploadDate: Date;
}