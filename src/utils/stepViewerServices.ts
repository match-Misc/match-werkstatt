// Online STEP Viewer Integration
// Verschiedene Viewer-Services für STEP-Dateien

export interface StepViewerService {
  name: string;
  url: string;
  embedUrl: (fileUrl: string) => string;
  features: string[];
  limitations: string[];
  privacy: 'public' | 'private' | 'hybrid';
}

export const stepViewerServices: StepViewerService[] = [
  {
    name: 'KISTERS 3DViewStation WebViewer',
    url: 'https://www.kisters.de/3dviewstation-webviewer',
    embedUrl: (fileUrl) => `https://webviewer.3dviewstation.com/embed?url=${encodeURIComponent(fileUrl)}`,
    features: [
      'Drehen, Zoomen, Verschieben',
      'Anmerkungen hinzufügen',
      'Messungen durchführen',
      'Cross-Sections',
      'PMI (Product Manufacturing Information)'
    ],
    limitations: [
      'Datei muss öffentlich zugänglich sein',
      'Eingeschränkte Offline-Funktionalität'
    ],
    privacy: 'hybrid'
  },
  {
    name: 'Partcloud WebGL Viewer',
    url: 'https://www.partcommunity.com/partcloud',
    embedUrl: (fileUrl) => `https://www.partcloud.com/viewer/embed?file=${encodeURIComponent(fileUrl)}`,
    features: [
      'WebGL Rendering',
      'STEP → glTF Konvertierung',
      'Interaktive Navigation',
      'Mobile-freundlich'
    ],
    limitations: [
      'Konvertierungszeit erforderlich',
      'File-Size Limits'
    ],
    privacy: 'public'
  },
  {
    name: 'CAD Exchanger Web Toolkit',
    url: 'https://cadexchanger.com/products/sdk/web-toolkit/',
    embedUrl: (fileUrl) => `https://viewer.cadexchanger.com/embed?url=${encodeURIComponent(fileUrl)}`,
    features: [
      'Native STEP Support',
      'High-Quality Rendering',
      'Animations',
      'Assembly Trees'
    ],
    limitations: [
      'Kommerzielle Lizenz erforderlich',
      'Setup-Aufwand'
    ],
    privacy: 'private'
  }
];

// Utility functions for STEP viewer integration
export const stepViewerUtils = {
  
  // Check if file is publicly accessible for online viewers
  async isFilePubliclyAccessible(fileUrl: string): Promise<boolean> {
    try {
      const response = await fetch(fileUrl, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  },

  // Get best viewer service based on requirements
  getBestViewer(requirements: {
    privacy?: 'public' | 'private';
    features?: string[];
    commercial?: boolean;
  }): StepViewerService {
    let candidates = stepViewerServices;
    
    if (requirements.privacy) {
      candidates = candidates.filter(service => 
        service.privacy === requirements.privacy || service.privacy === 'hybrid'
      );
    }
    
    if (requirements.commercial === false) {
      candidates = candidates.filter(service => 
        !service.limitations.some(limit => limit.includes('Lizenz'))
      );
    }
    
    return candidates[0] || stepViewerServices[0];
  },

  // Generate embed iframe HTML
  generateEmbedCode(service: StepViewerService, fileUrl: string, options: {
    width?: string;
    height?: string;
    allowFullscreen?: boolean;
  } = {}): string {
    const {
      width = '100%',
      height = '500px',
      allowFullscreen = true
    } = options;
    
    return `
      <iframe 
        src="${service.embedUrl(fileUrl)}"
        width="${width}"
        height="${height}"
        frameborder="0"
        ${allowFullscreen ? 'allowfullscreen' : ''}
        style="border: none; border-radius: 8px;"
      ></iframe>
    `;
  }
};
