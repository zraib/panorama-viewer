'use client';

import React, { useState, useEffect } from 'react';
import { POIPreviewProps } from '@/types/poi';
import { getFileCategory } from './utils';
import {
  FaTimes,
  FaFile,
  FaImage,
  FaVideo,
  FaFilePdf,
  FaExternalLinkAlt,
  FaEdit,
  FaTrash,
} from 'react-icons/fa';
import ConfirmationModal from '../ui/ConfirmationModal';
import styles from './POIPreview.module.css';
import { getFileUrl } from '@/utils/storage-config';
// Using iframe-based PDF viewer for better compatibility

const POIPreview: React.FC<POIPreviewProps> = ({ poi, projectId, onClose, onEdit, onDelete }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setIsLoading(false);
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(poi);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    if (onDelete) {
      onDelete(poi.id);
    }
    setShowDeleteConfirm(false);
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  const handlePdfLoad = () => {
    setIsLoading(false);
    setPdfError(false);
  };

  const handlePdfError = () => {
    setPdfError(true);
    setIsLoading(false);
  };

  const getContentPath = () => {
    if (poi.type === 'iframe') {
      return poi.content;
    }
    // Use storage-aware API route for file serving
    return getFileUrl(`${projectId}/data/poi/attachments/${poi.content}`);
  };

  const renderFileIcon = (category: string) => {
    switch (category) {
      case 'image':
        return <FaImage className="text-blue-500" size={24} />;
      case 'video':
        return <FaVideo className="text-green-500" size={24} />;
      case 'pdf':
        return <FaFilePdf className="text-red-500" size={24} />;
      default:
        return <FaFile className="text-gray-500" size={24} />;
    }
  };

  const decodeHtmlEntities = (text: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  const getIframeContent = () => {
    const content = poi.content.trim();
    
    // If it's HTML iframe code, extract src or render directly
    if (content.toLowerCase().startsWith('<iframe')) {
      // Decode HTML entities first
      const decodedContent = decodeHtmlEntities(content);
      
      // Try to extract src attribute from decoded content
      const srcMatch = decodedContent.match(/src=["']([^"']+)["']/i);
      if (srcMatch) {
        return {
          src: srcMatch[1],
          html: decodedContent,
          isHtml: true
        };
      }
      // If no src found, render as HTML
      return {
        src: null,
        html: decodedContent,
        isHtml: true
      };
    }
    
    // It's a direct URL
    return {
      src: content,
      html: null,
      isHtml: false
    };
  };

  const renderContent = () => {
    if (poi.type === 'iframe') {
      const iframeContent = getIframeContent();
      
      return (
        <div className={styles.iframeContainer}>
          {isLoading && (
            <div className={styles.loadingSpinner}>
              <div className={styles.spinner}></div>
            </div>
          )}
          {iframeContent.isHtml && iframeContent.html ? (
            <div 
              dangerouslySetInnerHTML={{ __html: iframeContent.html }}
              className={styles.iframeWrapper}
            />
          ) : (
            <iframe
              src={iframeContent.src || poi.content}
              className={styles.iframe}
              title={poi.name}
              onLoad={handleImageLoad}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          )}
          {iframeContent.src && (
            <a
              href={iframeContent.src}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLinkButton}
              title="Open in new tab"
            >
              <FaExternalLinkAlt size={12} />
            </a>
          )}
        </div>
      );
    }

    // File content
    const contentPath = getContentPath();
    const fileExtension = poi.content.split('.').pop()?.toLowerCase() || '';
    const mimeType = getMimeType(fileExtension);
    const category = getFileCategory(mimeType);

    if (category === 'image') {
      return (
        <div className={styles.imageContainer}>
          {isLoading && (
            <div className={styles.imageLoadingContainer}>
              <div className={styles.spinner}></div>
            </div>
          )}
          {imageError ? (
            <div className={styles.errorContainer}>
              <FaImage className={styles.errorIcon} size={48} />
              <p className={styles.errorText}>Failed to load image</p>
              <a
                href={contentPath}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.errorLink}
              >
                Open file directly
              </a>
            </div>
          ) : (
            <img
              src={contentPath}
              alt={poi.name}
              className={styles.previewImage}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          )}
        </div>
      );
    }

    if (category === 'video') {
      return (
        <div className={styles.videoContainer}>
          {isLoading && (
            <div className={styles.videoLoadingContainer}>
              <div className={styles.spinner}></div>
            </div>
          )}
          <video
            src={contentPath}
            controls
            className={styles.previewVideo}
            onLoadedData={handleImageLoad}
            onError={handleImageError}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    // For PDFs, show PDF viewer
    if (category === 'pdf') {
      return (
        <div className={styles.pdfContainer}>
          {isLoading && (
            <div className={styles.pdfLoadingContainer}>
              <div className={styles.spinner}></div>
              <p>Loading PDF...</p>
            </div>
          )}
          {pdfError ? (
            <div className={styles.errorContainer}>
              <FaFilePdf className={styles.errorIcon} size={48} />
              <p className={styles.errorText}>Failed to load PDF</p>
              <a
                href={contentPath}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.errorLink}
              >
                Open PDF directly
              </a>
            </div>
          ) : (
            <>
              <iframe
                src={contentPath}
                className={styles.pdfIframe}
                title={`PDF: ${poi.name}`}
                onLoad={handlePdfLoad}
                onError={handlePdfError}
                style={{
                  width: '100%',
                  height: '600px',
                  border: 'none',
                  borderRadius: '8px'
                }}
              />
              <div className={styles.pdfActions}>
                <a
                  href={contentPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.openFileButton}
                >
                  Open in new tab
                </a>
              </div>
            </>
          )}
        </div>
      );
    }

    // For other files, show download link
    return (
      <div className={styles.fileContainer}>
        <div className={styles.fileIcon}>{renderFileIcon(category)}</div>
        <p className={styles.fileName}>{poi.content}</p>
        <a
          href={contentPath}
          target='_blank'
          rel='noopener noreferrer'
          className={styles.openFileButton}
        >
          Open File
        </a>
      </div>
    );
  };

  const getMimeType = (extension: string): string => {
    const mimeTypes: { [key: string]: string } = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      pdf: 'application/pdf',
      mp4: 'video/mp4',
      webm: 'video/webm'
    };
    return mimeTypes[extension] || 'application/octet-stream';
  };

  return (
    <div className={styles.previewOverlay}>
      <div className={styles.previewContainer}>
        <div className={styles.previewHeader}>
          <div className={styles.headerInfo}>
            <h2 className={styles.previewTitle}>{poi.name}</h2>
          </div>
          <div className={styles.headerActions}>
            {onEdit && (
              <button
                onClick={handleEdit}
                className={`${styles.actionButton} ${styles.editButton}`}
                title="Edit POI"
              >
                <FaEdit size={16} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                className={`${styles.actionButton} ${styles.deleteButton}`}
                title="Delete POI"
              >
                <FaTrash size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className={`${styles.actionButton} ${styles.closeButton}`}
              title="Close"
            >
              <FaTimes size={16} />
            </button>
          </div>
        </div>

        <div className={styles.previewContent}>
          {poi.description && (
            <div className={styles.descriptionSection}>
              <h3 className={styles.sectionTitle}>
                Description
              </h3>
              <p className={styles.descriptionText}>
                {poi.description}
              </p>
            </div>
          )}

          <div className={styles.contentSection}>
            <h3 className={styles.sectionTitle}>Content</h3>
            {renderContent()}
          </div>

          <div className={styles.previewFooter}>
            <p className={styles.footerText}>Created: {new Date(poi.createdAt).toLocaleString()}</p>
            {poi.updatedAt !== poi.createdAt && (
              <p className={styles.footerText}>Updated: {new Date(poi.updatedAt).toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>
      
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete POI"
        message={`Are you sure you want to delete "${poi.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        variant="danger"
      />
    </div>
  );
};

export default POIPreview;