/**
 * PhotoUploadModal Component
 *
 * Modal for uploading photos to a location's gallery.
 * Features drag-and-drop, file browser, preview thumbnails, and upload progress.
 *
 * Props:
 * - isOpen: boolean - Controls modal visibility
 * - onClose: () => void - Called when modal is closed
 * - locationId: number|string - Location ID to upload photos to
 * - onUploadSuccess: () => void - Optional callback after successful upload
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocationPhotoUpload } from '../../../../hooks/useLocationPhotoUpload';
import './styles.css';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/heic', 'image/heif'];

function PhotoUploadModal({ isOpen, onClose, locationId, onUploadSuccess }) {
  const [isClosing, setIsClosing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState(null);
  const [isPreviewsClosing, setIsPreviewsClosing] = useState(false);

  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  const { mutate: uploadPhotos, isPending: isUploading, error: uploadError } = useLocationPhotoUpload(locationId);

  // Generate previews when files change
  useEffect(() => {
    if (selectedFiles.length === 0) {
      setPreviews([]);
      return;
    }

    const newPreviews = [];
    selectedFiles.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newPreviews[index] = e.target.result;
        if (newPreviews.filter(Boolean).length === selectedFiles.length) {
          setPreviews([...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    });

    // Cleanup object URLs on unmount
    return () => {
      newPreviews.forEach((url) => {
        if (url && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [selectedFiles]);

  // Handle close with animation
  const handleClose = useCallback(() => {
    if (isUploading) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      setSelectedFiles([]);
      setPreviews([]);
      setValidationError(null);
      onClose();
    }, 300);
  }, [onClose, isUploading]);

  // Close modal on ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape' && !isUploading) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose, isUploading]);

  // Handle overlay click
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !isUploading) {
      handleClose();
    }
  };

  // Validate files
  const validateFiles = useCallback((files) => {
    const fileArray = Array.from(files);

    // Check total count
    if (fileArray.length + selectedFiles.length > MAX_FILES) {
      return `Maximum ${MAX_FILES} photos per upload`;
    }

    // Check each file
    for (const file of fileArray) {
      // Check file type - also check extension for HEIC (browsers often report wrong MIME type)
      const ext = file.name.toLowerCase().split('.').pop();
      const isHeic = ext === 'heic' || ext === 'heif';
      const isValidType = ACCEPTED_TYPES.includes(file.type) || isHeic;

      if (!isValidType) {
        return `"${file.name}" is not a valid image format. Use PNG, JPG, JPEG, or HEIC.`;
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        return `"${file.name}" is too large. Maximum size is 5MB.`;
      }
    }

    return null;
  }, [selectedFiles.length]);

  // Handle file selection
  const handleFileSelect = useCallback((files) => {
    const error = validateFiles(files);
    if (error) {
      setValidationError(error);
      return;
    }

    setValidationError(null);
    const fileArray = Array.from(files);
    setSelectedFiles((prev) => [...prev, ...fileArray].slice(0, MAX_FILES));
  }, [validateFiles]);

  // Handle input change
  const handleInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files);
      // Reset input value so same file can be selected again
      e.target.value = '';
    }
  };

  // Handle browse click
  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  // Remove a selected file
  const handleRemoveFile = (index) => {
    // If removing the last file, animate out simultaneously with dropzone expanding
    if (selectedFiles.length === 1) {
      setIsPreviewsClosing(true);
      // Clear files after animation completes (matches --animation-duration)
      setTimeout(() => {
        setSelectedFiles([]);
        setIsPreviewsClosing(false);
      }, 200);
    } else {
      setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    }
    setValidationError(null);
  };

  // Handle upload
  const handleUpload = () => {
    if (selectedFiles.length === 0 || isUploading) return;

    uploadPhotos(selectedFiles, {
      onSuccess: () => {
        setSelectedFiles([]);
        setPreviews([]);
        setValidationError(null);
        onUploadSuccess?.();
        handleClose();
      },
    });
  };

  if (!isOpen) return null;

  const errorMessage = validationError || (uploadError?.response?.data?.detail || uploadError?.message);

  return createPortal(
    <div
      className={`photo-upload-overlay${isClosing ? ' photo-upload-overlay--closing' : ''}`}
      onClick={handleOverlayClick}
    >
      <div className={`photo-upload-modal${isClosing ? ' photo-upload-modal--closing' : ''}`}>
        {/* Header */}
        <div className="photo-upload-modal__header">
          <button
            className="photo-upload-modal__close"
            onClick={handleClose}
            aria-label="Close"
            disabled={isUploading}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
          <h2 className="photo-upload-modal__title">Upload Photos</h2>
          <div className="photo-upload-modal__header-spacer"></div>
        </div>

        {/* Content */}
        <div className="photo-upload-modal__content">
          {/* Drop zone */}
          <div
            className={`photo-upload-modal__dropzone${isDragging ? ' photo-upload-modal__dropzone--active' : ''}${selectedFiles.length > 0 && !isPreviewsClosing ? ' photo-upload-modal__dropzone--compact' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleInputChange}
              className="photo-upload-modal__input"
              aria-label="Select photos to upload"
            />

            <div className="photo-upload-modal__dropzone-content">
              <i className="fa-solid fa-cloud-arrow-up photo-upload-modal__dropzone-icon"></i>
              <p className="photo-upload-modal__dropzone-text">
                Drag and drop photos here, or{' '}
                <button
                  type="button"
                  className="photo-upload-modal__browse-link"
                  onClick={handleBrowseClick}
                >
                  browse files
                </button>
              </p>
              <p className="photo-upload-modal__dropzone-hint">
                PNG, JPG, JPEG, or HEIC (max 5MB each)
              </p>
            </div>
          </div>

          {/* Error message */}
          {errorMessage && (
            <div className="photo-upload-modal__error">
              <i className="fa-solid fa-circle-exclamation"></i>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Preview thumbnails */}
          {(selectedFiles.length > 0 || isPreviewsClosing) && (
            <div className={`photo-upload-modal__previews${isPreviewsClosing ? ' photo-upload-modal__previews--closing' : ''}`}>
              <div className="photo-upload-modal__previews-header">
                <span className="photo-upload-modal__previews-count">
                  {selectedFiles.length} of {MAX_FILES} photos selected
                </span>
              </div>
              <div className="photo-upload-modal__previews-grid">
                {selectedFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="photo-upload-modal__preview-item">
                    <div className="photo-upload-modal__preview">
                      {previews[index] ? (
                        <img
                          src={previews[index]}
                          alt={file.name}
                          className="photo-upload-modal__preview-image"
                        />
                      ) : (
                        <div className="photo-upload-modal__preview-loading">
                          <i className="fa-solid fa-spinner fa-spin"></i>
                        </div>
                      )}
                      <button
                        type="button"
                        className="photo-upload-modal__preview-remove"
                        onClick={() => handleRemoveFile(index)}
                        aria-label={`Remove ${file.name}`}
                        disabled={isUploading}
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                    <span className="photo-upload-modal__preview-size">
                      {file.size < 1024 * 1024
                        ? `${(file.size / 1024).toFixed(0)} KB`
                        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="photo-upload-modal__footer">
          <button
            type="button"
            className="photo-upload-modal__submit"
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || isUploading}
          >
            {isUploading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin"></i>
                <span>Uploading...</span>
              </>
            ) : (
              <span>Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default PhotoUploadModal;
