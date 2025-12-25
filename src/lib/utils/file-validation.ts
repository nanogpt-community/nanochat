// File validation utilities for different file types

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  fileType?: 'image' | 'pdf' | 'markdown' | 'text' | 'epub';
}

export interface FileLimits {
  maxSize: number; // in bytes
  allowedExtensions: string[];
  allowedMimeTypes: string[];
}

// File type configurations
export const FILE_TYPE_CONFIGS = {
  image: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'],
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'],
  },
  pdf: {
    maxSize: 20 * 1024 * 1024, // 20MB
    allowedExtensions: ['.pdf'],
    allowedMimeTypes: ['application/pdf'],
  },
  markdown: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedExtensions: ['.md', '.markdown'],
    allowedMimeTypes: ['text/markdown', 'text/x-markdown'],
  },
  text: {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedExtensions: ['.txt'],
    allowedMimeTypes: ['text/plain'],
  },
  epub: {
    maxSize: 50 * 1024 * 1024, // 50MB - EPUBs can be large
    allowedExtensions: ['.epub'],
    allowedMimeTypes: ['application/epub+zip'],
  },
} as const;

// Get file type from file
export function getFileType(file: File): 'image' | 'pdf' | 'markdown' | 'text' | 'epub' | null {
  const extension = getFileExtension(file.name);
  const mimeType = file.type.toLowerCase();

  // Check image files
  if ((FILE_TYPE_CONFIGS.image.allowedMimeTypes as readonly string[]).includes(mimeType) ||
    (FILE_TYPE_CONFIGS.image.allowedExtensions as readonly string[]).includes(extension)) {
    return 'image';
  }

  // Check PDF files
  if ((FILE_TYPE_CONFIGS.pdf.allowedMimeTypes as readonly string[]).includes(mimeType) ||
    (FILE_TYPE_CONFIGS.pdf.allowedExtensions as readonly string[]).includes(extension)) {
    return 'pdf';
  }

  // Check markdown files
  if ((FILE_TYPE_CONFIGS.markdown.allowedMimeTypes as readonly string[]).includes(mimeType) ||
    (FILE_TYPE_CONFIGS.markdown.allowedExtensions as readonly string[]).includes(extension)) {
    return 'markdown';
  }

  // Check text files
  if ((FILE_TYPE_CONFIGS.text.allowedMimeTypes as readonly string[]).includes(mimeType) ||
    (FILE_TYPE_CONFIGS.text.allowedExtensions as readonly string[]).includes(extension)) {
    return 'text';
  }

  // Check EPUB files
  if ((FILE_TYPE_CONFIGS.epub.allowedMimeTypes as readonly string[]).includes(mimeType) ||
    (FILE_TYPE_CONFIGS.epub.allowedExtensions as readonly string[]).includes(extension)) {
    return 'epub';
  }

  return null;
}

// Get file extension from filename
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.substring(lastDot).toLowerCase() : '';
}

// Validate file based on type
export function validateFile(file: File, allowedTypes: Array<'image' | 'pdf' | 'markdown' | 'text' | 'epub'> = ['image', 'pdf', 'markdown', 'text', 'epub']): FileValidationResult {
  const fileType = getFileType(file);

  if (!fileType) {
    return {
      isValid: false,
      error: `Unsupported file type. Allowed types: ${allowedTypes.map(type => FILE_TYPE_CONFIGS[type].allowedExtensions.join(', ')).join(', ')}`
    };
  }

  if (!allowedTypes.includes(fileType)) {
    return {
      isValid: false,
      error: `File type "${fileType}" is not allowed for this upload.`
    };
  }

  const config = FILE_TYPE_CONFIGS[fileType];

  // Check file size
  if (file.size > config.maxSize) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const limitMB = (config.maxSize / (1024 * 1024)).toFixed(1);
    return {
      isValid: false,
      error: `File size (${sizeMB}MB) exceeds the maximum allowed size (${limitMB}MB) for ${fileType} files.`
    };
  }

  // Check MIME type
  if (!(config.allowedMimeTypes as readonly string[]).includes(file.type) && !(config.allowedExtensions as readonly string[]).includes(getFileExtension(file.name))) {
    return {
      isValid: false,
      error: `Invalid file format for ${fileType}. Expected: ${config.allowedMimeTypes.join(', ')} or ${config.allowedExtensions.join(', ')}`
    };
  }

  return {
    isValid: true,
    fileType,
  };
}

// Validate multiple files
export function validateFiles(files: FileList | File[], allowedTypes?: Array<'image' | 'pdf' | 'markdown' | 'text' | 'epub'>): {
  validFiles: File[];
  errors: string[];
  fileTypes: Array<'image' | 'pdf' | 'markdown' | 'text' | 'epub'>;
} {
  const validFiles: File[] = [];
  const errors: string[] = [];
  const fileTypes: Array<'image' | 'pdf' | 'markdown' | 'text' | 'epub'> = [];

  Array.from(files).forEach(file => {
    const validation = validateFile(file, allowedTypes);

    if (validation.isValid) {
      validFiles.push(file);
      if (validation.fileType) {
        fileTypes.push(validation.fileType);
      }
    } else {
      errors.push(`${file.name}: ${validation.error}`);
    }
  });

  return {
    validFiles,
    errors,
    fileTypes,
  };
}

// Get file icon based on type
export function getFileIcon(fileType: 'image' | 'pdf' | 'markdown' | 'text' | 'epub'): string {
  switch (fileType) {
    case 'image':
      return '🖼️';
    case 'pdf':
      return '📄';
    case 'markdown':
      return '📝';
    case 'text':
      return '📄';
    case 'epub':
      return '📚';
    default:
      return '📎';
  }
}

// Get human readable file size
export function getFormattedFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}