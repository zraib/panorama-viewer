import { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import styles from '@/styles/Upload.module.css';
import { getUploadApiUrl, getProjectsApiUrl } from '../utils/storage-config';

export default function Upload() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [referrerUrl, setReferrerUrl] = useState<string>('/');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [duplicateImages, setDuplicateImages] = useState<
    { name: string; size: number; lastModified: number }[]
  >([]);
  const [showDuplicatePreview, setShowDuplicatePreview] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [deleteAllAndUpload, setDeleteAllAndUpload] = useState(false);
  const [showSelectedFiles, setShowSelectedFiles] = useState(false);
  const [showDuplicateFiles, setShowDuplicateFiles] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [existingFiles, setExistingFiles] = useState<{
    csv: string | null;
    images: string[];
  }>({ csv: null, images: [] });
  const [showExistingFiles, setShowExistingFiles] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<{
    csv: File | null;
    images: File[];
  }>({ csv: null, images: [] });
  const [poiFile, setPOIFile] = useState<File | null>(null);
  const [poiImportMessage, setPOIImportMessage] = useState('');
  const [isImportingPOI, setIsImportingPOI] = useState(false);

  // This effect captures referrer information for smart back navigation
  useEffect(() => {
    const referrer = document.referrer;
    const urlParams = new URLSearchParams(window.location.search);
    const fromProject = urlParams.get('from');
    const fromScene = urlParams.get('scene');

    if (fromProject && fromScene) {
      setReferrerUrl(`/${fromProject}?scene=${fromScene}`);
    } else if (fromProject) {
      setReferrerUrl(`/${fromProject}`);
    } else if (editingProjectId) {
      setReferrerUrl(`/${editingProjectId}`);
    } else if (referrer && referrer.includes(window.location.origin)) {
      const referrerPath = referrer.replace(window.location.origin, '');
      setReferrerUrl(referrerPath || '/');
    }
  }, [editingProjectId]);

  // This effect handles project editing mode
  useEffect(() => {
    const projectParam = router.query.project as string;
    if (projectParam && !isEditMode) {
      setIsEditMode(true);
      setEditingProjectId(projectParam);
      setCreatedProjectId(projectParam);

      // Load existing project data
      const loadProjectData = async () => {
        try {
          // Load project info
          const projectResponse = await fetch(
            `${getProjectsApiUrl()}?projectId=${encodeURIComponent(projectParam)}`
          );
          if (projectResponse.ok) {
            const projectData = await projectResponse.json();
            const project = projectData.projects?.find(
              (p: any) => p.id === projectParam
            );
            if (project) {
              setProjectName(project.name);
            }
          }

          // Load existing files
          const filesResponse = await fetch(
            getUploadApiUrl(projectParam).replace('/upload', '/files')
          );
          if (filesResponse.ok) {
            const filesData = await filesResponse.json();
            const { files } = filesData;

            // Store existing files in state
            setExistingFiles({
              csv: files.csv,
              images: files.images,
            });

            let fileInfo = [];
            if (files.csv) {
              fileInfo.push(`CSV: ${files.csv}`);
            }
            if (files.images.length > 0) {
              fileInfo.push(`${files.images.length} image(s)`);
            }

            if (fileInfo.length > 0) {
              setMessage(
                `✏️ Editing project: ${projectName || projectParam}. Current files: ${fileInfo.join(', ')}. Upload new files to update this project.`
              );
            } else {
              setMessage(
                `✏️ Editing project: ${projectName || projectParam}. No existing files found. Upload files to add content to this project.`
              );
            }
          } else {
            setMessage(
              `✏️ Editing project: ${projectName || projectParam}. Upload new files to update this project.`
            );
          }
        } catch (error) {
          console.error('Failed to load project data:', error);
          setMessage(
            '⚠️ Failed to load project data. You can still upload files to update the project.'
          );
        }
      };

      loadProjectData();
    }
  }, [router.query.project, isEditMode]);

  // This effect will run once on mount to initialize file state
  useEffect(() => {
    const initializeFiles = async () => {
      // Try to restore from browser session (no longer checking legacy server files)
      try {
        if (
          typeof window !== 'undefined' &&
          (window as any).__uploadPageFiles
        ) {
          const storedFiles = (window as any).__uploadPageFiles;
          if (storedFiles.csv || storedFiles.images.length > 0) {
            setSelectedFiles(storedFiles);
            return;
          }
        }

        const savedData = sessionStorage.getItem('uploadPageFiles');
        if (savedData) {
          const fileData = JSON.parse(savedData);
          if (fileData.csv || fileData.images.length > 0) {
            setMessage(
              'ℹ️ Previous file selections were detected but need to be reselected due to browser security restrictions.'
            );
          }
        }
      } catch (error) {
        console.warn('Failed to restore files from storage:', error);
      }
    };

    if (!isEditMode) {
      initializeFiles();
    }
  }, [isEditMode]); // Only run when not in edit mode

  // This effect synchronizes the file input elements with the state
  useEffect(() => {
    const csvInput = document.getElementById('csv') as HTMLInputElement;
    const imagesInput = document.getElementById('images') as HTMLInputElement;

    const dtCsv = new DataTransfer();
    if (selectedFiles.csv) {
      dtCsv.items.add(selectedFiles.csv);
    }
    if (csvInput) {
      csvInput.files = dtCsv.files;
    }

    const dtImages = new DataTransfer();
    if (selectedFiles.images.length > 0) {
      selectedFiles.images.forEach(file => dtImages.items.add(file));
    }
    if (imagesInput) {
      imagesInput.files = dtImages.files;
    }
  }, [selectedFiles, existingFiles, isEditMode]);

  // This effect persists selected files for the session
  useEffect(() => {
    try {
      if (selectedFiles.csv || selectedFiles.images.length > 0) {
        const fileData = {
          csv: selectedFiles.csv
            ? {
                name: selectedFiles.csv.name,
                size: selectedFiles.csv.size,
                type: selectedFiles.csv.type,
                lastModified: selectedFiles.csv.lastModified,
              }
            : null,
          images: selectedFiles.images.map(file => ({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
          })),
        };
        sessionStorage.setItem('uploadPageFiles', JSON.stringify(fileData));

        if (typeof window !== 'undefined') {
          (window as any).__uploadPageFiles = {
            csv: selectedFiles.csv,
            images: selectedFiles.images,
          };
        }
      }
    } catch (error) {
      console.warn('Failed to save files to storage:', error);
    }
  }, [selectedFiles]);

  const handleDeleteAllAndUpload = () => {
    setDuplicateWarning([]);
    setDeleteAllAndUpload(true);
    const form = document.querySelector('form') as HTMLFormElement;
    if (form) {
      const syntheticEvent = {
        preventDefault: () => {},
        currentTarget: form,
        target: form,
        nativeEvent: new Event('submit'),
        bubbles: true,
        cancelable: true,
        defaultPrevented: false,
        eventPhase: 0,
        isTrusted: true,
        timeStamp: Date.now(),
        type: 'submit',
        _deleteAllMode: true,
      } as any;
      handleSubmit(syntheticEvent);
    }
  };

  // Validation functions
  const validateProjectName = (name: string): string[] => {
    const errors: string[] = [];
    if (!name.trim()) {
      errors.push('Project name is required');
    } else if (name.length < 3) {
      errors.push('Project name must be at least 3 characters long');
    } else if (name.length > 50) {
      errors.push('Project name must be less than 50 characters');
    } else if (!/^[a-zA-Z0-9\s\-_]+$/.test(name)) {
      errors.push(
        'Project name can only contain letters, numbers, spaces, hyphens, and underscores'
      );
    }
    return errors;
  };

  const validateCSVFile = (file: File): string[] => {
    const errors: string[] = [];
    if (file.name !== 'pano-poses.csv') {
      errors.push('CSV file must be named exactly "pano-poses.csv"');
    }
    if (!file.type.includes('csv') && !file.name.endsWith('.csv')) {
      errors.push('File must be a valid CSV file');
    }
    return errors;
  };

  const validateImageFiles = (files: File[]): string[] => {
    const errors: string[] = [];
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];

    if (files.length === 0) {
      errors.push('At least one image file is required');
      return errors;
    }

    const fileNames = new Set<string>();

    files.forEach((file, index) => {
      // Check file type
      if (!allowedTypes.includes(file.type)) {
        errors.push(
          `Image ${index + 1} (${file.name}): Only JPEG and PNG files are allowed`
        );
      }

      // Check for duplicate names in selection
      if (fileNames.has(file.name)) {
        errors.push(`Duplicate file name in selection: ${file.name}`);
      }
      fileNames.add(file.name);
    });

    return errors;
  };

  const detectDuplicateImages = (
    newFiles: File[]
  ): { name: string; size: number; lastModified: number }[] => {
    if (!isEditMode || existingFiles.images.length === 0) return [];

    const duplicates: { name: string; size: number; lastModified: number }[] =
      [];
    newFiles.forEach(file => {
      if (existingFiles.images.includes(file.name)) {
        duplicates.push({
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
        });
      }
    });

    return duplicates;
  };

  const removeDuplicateImages = () => {
    const duplicateNames = new Set(duplicateImages.map(img => img.name));
    const filteredImages = selectedFiles.images.filter(
      file => !duplicateNames.has(file.name)
    );

    setSelectedFiles(prev => ({ ...prev, images: filteredImages }));
    setDuplicateImages([]);
    setValidationErrors([]);

    // Update the file input
    const imagesInput = document.getElementById('images') as HTMLInputElement;
    if (imagesInput) {
      const dt = new DataTransfer();
      filteredImages.forEach(file => dt.items.add(file));
      imagesInput.files = dt.files;
    }
  };

  const handleProjectNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setProjectName(newName);

    // Real-time validation for project name
    if (newName.trim()) {
      const nameErrors = validateProjectName(newName);
      if (nameErrors.length > 0) {
        setValidationErrors(nameErrors);
      } else {
        setValidationErrors([]);
      }
    } else {
      setValidationErrors([]);
    }
  };

  const runDiagnostics = async () => {
    setLoadingDiagnostics(true);
    try {
      const response = await fetch('/api/diagnostics');
      const data = await response.json();
      setDiagnosticsData(data);
      setShowDiagnostics(true);
    } catch (error) {
      console.error('Failed to run diagnostics:', error);
      setDiagnosticsData({
        healthy: false,
        error: 'Failed to run diagnostics. Please check your connection.',
      });
      setShowDiagnostics(true);
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, files } = event.target;
    setValidationErrors([]);
    setDuplicateImages([]);

    if (name === 'csv' && files && files[0]) {
      const csvErrors = validateCSVFile(files[0]);
      if (csvErrors.length > 0) {
        setValidationErrors(csvErrors);
      }
      setSelectedFiles(prev => ({ ...prev, csv: files[0] }));
    } else if (name === 'images' && files) {
      const fileArray = Array.from(files);
      const imageErrors = validateImageFiles(fileArray);
      const duplicates = detectDuplicateImages(fileArray);

      if (imageErrors.length > 0) {
        setValidationErrors(imageErrors);
      }

      if (duplicates.length > 0) {
        setDuplicateImages(duplicates);
      }

      setSelectedFiles(prev => ({ ...prev, images: fileArray }));
    }
  };

  const handlePOIFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setPOIFile(file);
    setPOIImportMessage('');
  };

  const handlePOIImport = async () => {
    if (!poiFile) {
      setPOIImportMessage('❌ Please select a POI file to import');
      return;
    }

    if (!createdProjectId && !editingProjectId) {
      setPOIImportMessage('❌ Please create or select a project first');
      return;
    }

    const projectId = createdProjectId || editingProjectId;
    if (!projectId) {
      setPOIImportMessage('❌ No project selected for POI import');
      return;
    }

    setIsImportingPOI(true);
    setPOIImportMessage('📤 Importing POI data...');

    try {
      const formData = new FormData();
      formData.append('file', poiFile);
      formData.append('projectId', projectId);

      const response = await fetch('/api/poi/import-single', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        setPOIImportMessage(`✅ ${result.message}`);
        setPOIFile(null);
        // Clear the file input
        const fileInput = document.getElementById('poiFile') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
      } else {
        const errorData = await response.json();
        setPOIImportMessage(`❌ Import failed: ${errorData.error}`);
      }
    } catch (error) {
      console.error('POI import error:', error);
      setPOIImportMessage('❌ Failed to import POI data. Please try again.');
    } finally {
       setIsImportingPOI(false);
     }
   };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement> & {
      _overwriteMode?: boolean;
      _deleteAllMode?: boolean;
    }
  ) => {
    event.preventDefault();
    setMessage('');
    setDuplicateWarning([]);
    setValidationErrors([]);
    setUploadSuccess(false);
    setUploadProgress(0);
    setIsLoading(true);

    // Comprehensive validation before submission
    const allErrors: string[] = [];

    // Validate project name
    const nameErrors = validateProjectName(projectName);
    allErrors.push(...nameErrors);

    // In edit mode, allow updating without requiring new files if existing files are present
    const hasExistingCsv = isEditMode && existingFiles.csv;
    const hasExistingImages = isEditMode && existingFiles.images.length > 0;
    const hasNewCsv = selectedFiles.csv;
    const hasNewImages = selectedFiles.images.length > 0;

    // Validate CSV file
    if (!hasNewCsv && !hasExistingCsv) {
      allErrors.push('Please select a CSV file.');
    } else if (hasNewCsv) {
      const csvErrors = validateCSVFile(selectedFiles.csv!);
      allErrors.push(...csvErrors);
    }

    // Validate image files
    if (!hasNewImages && !hasExistingImages) {
      allErrors.push('Please select at least one image.');
    } else if (hasNewImages) {
      const imageErrors = validateImageFiles(selectedFiles.images);
      allErrors.push(...imageErrors);
    }

    // If there are validation errors, show them and stop
    if (allErrors.length > 0) {
      setValidationErrors(allErrors);
      setIsLoading(false);
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData();

    // Manually append form data to implement logic for existing files in edit mode.
    formData.append('projectName', projectName.trim());

    // Handle CSV file
    if (selectedFiles.csv) {
      formData.append('csv', selectedFiles.csv);
    } else if (isEditMode && existingFiles.csv) {
      formData.append('existing_csv', existingFiles.csv);
    }

    // Handle image files
    if (selectedFiles.images.length > 0) {
      selectedFiles.images.forEach(image => {
        formData.append('images', image);
      });
    } else if (isEditMode && existingFiles.images.length > 0) {
      existingFiles.images.forEach(imageName => {
        formData.append('existing_images', imageName);
      });
    }

    if (allowOverwrite || event._overwriteMode) {
      formData.append('overwrite', 'true');
    }

    if (deleteAllAndUpload || event._deleteAllMode) {
      formData.append('deleteAll', 'true');
    }
    setAllowOverwrite(false);

    // Show upload preparation message for large uploads
    const totalFiles =
      selectedFiles.images.length + (selectedFiles.csv ? 1 : 0);
    if (totalFiles > 10) {
      setMessage(
        'Large upload detected. This may take several minutes. Please be patient and do not close this page.'
      );
    }

    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev < 90) return prev + Math.random() * 10;
          return prev;
        });
      }, 1000);

      let projectId: string;

      if (isEditMode && editingProjectId) {
        // Use existing project ID for editing
        projectId = editingProjectId;

        // Update project name if it has changed
        try {
          await fetch(getProjectsApiUrl(), {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId: editingProjectId,
              projectName: projectName.trim(),
            }),
          });
        } catch (error) {
          console.warn('Failed to update project name:', error);
        }
      } else {
        // Create new project
        const projectResponse = await fetch(getProjectsApiUrl(), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ projectName: projectName.trim() }),
        });

        if (!projectResponse.ok) {
          const projectError = await projectResponse.json();
          if (projectResponse.status === 409) {
            setValidationErrors([
              `❌ Project name "${projectName.trim()}" already exists`,
              '💡 Please choose a different name or edit the existing project',
            ]);
            setIsLoading(false);
            return;
          } else if (projectResponse.status === 400) {
            setValidationErrors([
              '❌ Invalid project name',
              '💡 Project names can only contain letters, numbers, spaces, hyphens, and underscores',
            ]);
            setIsLoading(false);
            return;
          } else {
            throw new Error(projectError.error || 'Failed to create project');
          }
        }

        const projectData = await projectResponse.json();
        projectId = projectData.project.id;
        setCreatedProjectId(projectId);
      }

      // Upload files to the project
      const response = await fetch(
        getUploadApiUrl(projectId),
        {
          method: 'POST',
          body: formData,
        }
      );

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (response.ok) {
        const result = await response.json();
        setMessage(result.message);
        setUploadSuccess(true);

        try {
          sessionStorage.removeItem('uploadPageFiles');
          if (typeof window !== 'undefined') {
            delete (window as any).__uploadPageFiles;
          }
        } catch (error) {
          console.warn('Failed to clear stored files:', error);
        }
      } else {
        const errorData = await response.json();

        if (response.status === 409 && errorData.duplicates) {
          setDuplicateWarning(errorData.duplicates);
          setMessage(errorData.message);
        } else if (response.status === 413) {
          setMessage(
            `Upload failed: ${errorData.error} Try uploading fewer files or reducing file sizes.`
          );
        } else if (response.status === 408) {
          setMessage(
            `Upload timeout: ${errorData.error} Try uploading fewer files at once.`
          );
        } else if (
          response.status === 500 &&
          errorData.error === 'Configuration generation failed'
        ) {
          // Handle configuration generation errors with more detail
          setMessage(
            `⚠️ Files uploaded successfully, but configuration generation failed.\n\n` +
              `Error: ${errorData.message}\n\n` +
              `💡 You can try running this command manually:\n` +
              `${errorData.manualCommand || 'node scripts/node/generate-config.js --project "' + projectId + '"'}`
          );
        } else {
          setMessage(
            `Upload failed: ${errorData.error || errorData.message || 'Unknown error'}`
          );
        }
      }
    } catch (error: any) {
      setUploadProgress(0);
      if (error.name === 'AbortError') {
        setMessage('Upload was cancelled.');
      } else if (error.message.includes('Failed to fetch')) {
        setMessage(
          'Network error. Please check your connection and try again.'
        );
      } else {
        setMessage('An error occurred during upload. Please try again.');
      }
      console.error('Upload error:', error);
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadProgress(0), 2000);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.logoContainer}>
        <img
          src='/assets/svg/primezone-logo.svg'
          alt='PrimeZone Logo'
          className={styles.logo}
        />
      </div>
      <div className={styles.content}>
        <div className={styles.header}>
          <button
            onClick={() => {
              if (window.history.length > 1) {
                router.back();
              } else {
                const targetUrl = editingProjectId
                  ? `/${editingProjectId}`
                  : referrerUrl;
                router.push(targetUrl);
              }
            }}
            className={styles.backLink}
          >
            ← Back to Panorama Viewer
          </button>
        </div>

        <h1 className={styles.title}>
          {isEditMode ? 'Edit Project Data' : 'Upload Panorama Data'}
        </h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor='projectName' className={styles.label}>
              📁 Project Name:
            </label>
            <input
              type='text'
              id='projectName'
              name='projectName'
              value={projectName}
              onChange={handleProjectNameChange}
              placeholder='Enter a name for your project'
              required
              className={`${styles.textInput} ${validationErrors.some(error => error.includes('Project name')) ? styles.inputError : ''}`}
            />
            <div className={styles.inputHint}>
              {isEditMode
                ? 'Update the name of your existing project.'
                : 'This will create a new project folder for your panorama data.'}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor='csv' className={styles.label}>
              📄 CSV File
              {isEditMode && existingFiles.csv
                ? ' (Optional - will replace existing)'
                : ''}
              :
            </label>
            {selectedFiles.csv &&
              selectedFiles.csv.name !== 'pano-poses.csv' && (
                <div className={styles.csvInstruction}>
                  <p>
                    ⚠️ Important: Your CSV file must be named exactly{' '}
                    <strong>"pano-poses.csv"</strong>
                  </p>
                </div>
              )}
            <input
              type='file'
              id='csv'
              name='csv'
              accept='.csv'
              required={!isEditMode || !existingFiles.csv}
              onChange={handleFileChange}
              className={styles.fileInput}
            />
            {(selectedFiles.csv || (isEditMode && existingFiles.csv)) && (
              <div className={styles.fileInfo}>
                Selected:{' '}
                {selectedFiles.csv ? selectedFiles.csv.name : existingFiles.csv}
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor='images' className={styles.label}>
              🖼️ Panorama Images
              {isEditMode && existingFiles.images.length > 0
                ? ' (Optional - will add to existing)'
                : ''}
              :
            </label>
            <input
              type='file'
              id='images'
              name='images'
              accept='image/*'
              multiple
              required={!isEditMode || existingFiles.images.length === 0}
              onChange={handleFileChange}
              className={styles.fileInput}
            />
            {selectedFiles.images.length > 0 && (
              <div className={styles.fileList}>
                <div className={styles.fileListHeader}>
                  <p className={styles.fileListTitle}>
                    Selected {selectedFiles.images.length} new image(s)
                  </p>
                  <button
                    type='button'
                    onClick={() => setShowSelectedFiles(!showSelectedFiles)}
                    className={styles.toggleButton}
                  >
                    {showSelectedFiles ? '▼ Hide' : '▶ Show'}
                  </button>
                </div>
                {showSelectedFiles && (
                  <ul className={styles.fileListItems}>
                    {selectedFiles.images.map((file, index) => (
                      <li key={index}>{file.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {isEditMode &&
            (existingFiles.csv || existingFiles.images.length > 0) && (
              <div className={styles.formGroup}>
                <div className={styles.fileList}>
                  <div className={styles.fileListHeader}>
                    <p className={styles.fileListTitle}>
                      Current Project Files
                    </p>
                    <button
                      type='button'
                      onClick={() => setShowExistingFiles(!showExistingFiles)}
                      className={styles.toggleButton}
                    >
                      {showExistingFiles ? '▼ Hide' : '▶ Show'}
                    </button>
                  </div>
                  {showExistingFiles && (
                    <ul className={styles.fileListItems}>
                      {existingFiles.csv && <li>{existingFiles.csv}</li>}
                      {existingFiles.images.map((imageName, index) => (
                        <li key={index}>{imageName}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

          {/* POI Import Section */}
          {(uploadSuccess || isEditMode) && (createdProjectId || editingProjectId) && (
            <div className={styles.formGroup}>
              <div className={styles.poiImportSection}>
                <h3 className={styles.sectionTitle}>📍 Import POI Data (Optional)</h3>
                <p className={styles.inputHint}>
                  Import Points of Interest from a previously exported POI file (.json or .zip format).
                </p>
                
                <div className={styles.poiImportControls}>
                  <label htmlFor='poiFile' className={styles.label}>
                    📎 POI File:
                  </label>
                  <input
                    type='file'
                    id='poiFile'
                    name='poiFile'
                    accept='.json,.zip'
                    onChange={handlePOIFileChange}
                    className={styles.fileInput}
                  />
                  {poiFile && (
                    <div className={styles.fileInfo}>
                      Selected: {poiFile.name} ({Math.round(poiFile.size / 1024)} KB)
                    </div>
                  )}
                  
                  <button
                    type='button'
                    onClick={handlePOIImport}
                    disabled={!poiFile || isImportingPOI}
                    className={`${styles.poiImportButton} ${
                      !poiFile || isImportingPOI ? styles.submitButtonDisabled : ''
                    }`}
                  >
                    {isImportingPOI && <span className={styles.loadingSpinner}></span>}
                    {isImportingPOI ? '📤 Importing...' : '📥 Import POI Data'}
                  </button>
                </div>
                
                {poiImportMessage && (
                  <div
                    className={`${styles.message} ${
                      poiImportMessage.includes('❌') || poiImportMessage.includes('failed')
                        ? styles.messageError
                        : poiImportMessage.includes('✅')
                        ? styles.messageSuccess
                        : styles.messageInfo
                    }`}
                    style={{ marginTop: '12px', fontSize: '0.9rem' }}
                  >
                    {poiImportMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            type='submit'
            disabled={isLoading || validationErrors.length > 0}
            className={`${styles.submitButton} ${
              validationErrors.length > 0 ? styles.submitButtonDisabled : ''
            }`}
          >
            {isLoading && <span className={styles.loadingSpinner}></span>}
            {validationErrors.length > 0 && !isLoading
              ? '⚠️ Fix errors to continue'
              : isLoading
                ? isEditMode
                  ? 'Updating Project...'
                  : 'Uploading and Generating...'
                : isEditMode
                  ? '✅ Update Project'
                  : '🚀 Upload and Generate'}
          </button>

          {/* File Summary */}
          {(selectedFiles.csv || selectedFiles.images.length > 0) && (
            <div className={styles.fileSummary}>
              <h4 className={styles.summaryTitle}>📋 Upload Summary</h4>
              <div className={styles.summaryContent}>
                {selectedFiles.csv && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryIcon}>📄</span>
                    <span className={styles.summaryText}>
                      CSV: {selectedFiles.csv.name} (
                      {Math.round(selectedFiles.csv.size / 1024)} KB)
                    </span>
                  </div>
                )}
                {selectedFiles.images.length > 0 && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryIcon}>🖼️</span>
                    <span className={styles.summaryText}>
                      {selectedFiles.images.length} image(s) (
                      {Math.round(
                        selectedFiles.images.reduce(
                          (sum, file) => sum + file.size,
                          0
                        ) /
                          1024 /
                          1024
                      )}{' '}
                      MB total)
                    </span>
                  </div>
                )}
                {duplicateImages.length > 0 && (
                  <div className={styles.summaryItem}>
                    <span className={styles.summaryIcon}>⚠️</span>
                    <span className={styles.summaryText}>
                      {duplicateImages.length} duplicate(s) detected
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {isLoading && uploadProgress > 0 && (
            <div className={styles.progressContainer}>
              <div className={styles.progressHeader}>
                <span className={styles.progressTitle}>
                  {uploadProgress < 30
                    ? '📤 Preparing files...'
                    : uploadProgress < 70
                      ? '⬆️ Uploading files...'
                      : uploadProgress < 100
                        ? '📊 Processing data...'
                        : '🔧 Generating configuration...'}
                </span>
                <span className={styles.progressPercentage}>
                  {uploadProgress < 100
                    ? `${Math.round(uploadProgress)}%`
                    : '99%'}
                </span>
              </div>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <div className={styles.progressDetails}>
                {uploadProgress < 100 ? (
                  <span className={styles.progressSubtext}>
                    Please keep this page open while files are being
                    processed...
                  </span>
                ) : (
                  <span className={styles.progressSubtext}>
                    Almost done! Finalizing your panorama project...
                  </span>
                )}
              </div>
            </div>
          )}
        </form>

        {/* Validation Errors Display */}
        {validationErrors.length > 0 && (
          <div className={`${styles.message} ${styles.messageError}`}>
            <div className={styles.errorHeader}>
              <h4>⚠️ Please fix the following issues:</h4>
            </div>
            <ul className={styles.errorList}>
              {validationErrors.map((error, index) => (
                <li key={index} className={styles.errorItem}>
                  {error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Duplicate Images Management */}
        {duplicateImages.length > 0 && (
          <div className={`${styles.message} ${styles.messageWarning}`}>
            <div className={styles.duplicateHeader}>
              <h4>
                🔄 Duplicate Images Detected ({duplicateImages.length} files)
              </h4>
              <button
                type='button'
                onClick={() => setShowDuplicatePreview(!showDuplicatePreview)}
                className={styles.toggleButton}
              >
                {showDuplicatePreview ? '▼ Hide Details' : '▶ Show Details'}
              </button>
            </div>
            {showDuplicatePreview && (
              <div className={styles.duplicateDetails}>
                <p className={styles.duplicateExplanation}>
                  These images have the same names as existing files in your
                  project:
                </p>
                <ul className={styles.duplicateList}>
                  {duplicateImages.map((img, index) => (
                    <li key={index} className={styles.duplicateItem}>
                      <span className={styles.fileName}>{img.name}</span>
                      <span className={styles.fileSize}>
                        ({Math.round(img.size / 1024)} KB)
                      </span>
                    </li>
                  ))}
                </ul>
                <div className={styles.duplicateActions}>
                  <p className={styles.actionText}>
                    💡 <strong>Options:</strong>
                  </p>
                  <ul className={styles.actionList}>
                    <li>✏️ Rename the duplicate files and re-select them</li>
                    <li>🔄 Continue upload to replace existing files</li>
                    <li>🗑️ Remove duplicates from your selection</li>
                  </ul>
                  <div className={styles.duplicateButtonContainer}>
                    <button
                      type='button'
                      onClick={removeDuplicateImages}
                      className={styles.removeDuplicatesButton}
                    >
                      🗑️ Remove Duplicate Images
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {duplicateWarning.length > 0 && (
          <div className={`${styles.message} ${styles.messageWarning}`}>
            <div className={styles.duplicateHeader}>
              <h4>
                ⚠️ Duplicate Files Detected ({duplicateWarning.length} files)
              </h4>
              <button
                type='button'
                onClick={() => setShowDuplicateFiles(!showDuplicateFiles)}
                className={styles.toggleButton}
              >
                {showDuplicateFiles ? '▼ Hide' : '▶ Show'}
              </button>
            </div>
            {showDuplicateFiles && (
              <ul className={styles.duplicateList}>
                {duplicateWarning.map((filename, index) => (
                  <li key={index}>{filename}</li>
                ))}
              </ul>
            )}
            <p>
              These files already exist. You can either rename them or choose to
              overwrite the existing files.
            </p>

            <div className={styles.duplicateActions}>
              <button
                onClick={e => {
                  e.preventDefault();
                  const form = document.querySelector(
                    'form'
                  ) as HTMLFormElement;
                  if (form) {
                    const syntheticEvent = {
                      preventDefault: () => {},
                      currentTarget: form,
                      target: form,
                      nativeEvent: new Event('submit'),
                      bubbles: true,
                      cancelable: true,
                      defaultPrevented: false,
                      eventPhase: 0,
                      isTrusted: true,
                      timeStamp: Date.now(),
                      type: 'submit',
                      _overwriteMode: true,
                    } as unknown as FormEvent<HTMLFormElement> & {
                      _overwriteMode: boolean;
                    };
                    handleSubmit(syntheticEvent);
                  }
                }}
                disabled={isLoading}
                className={styles.overwriteButton}
              >
                {isLoading && <span className={styles.loadingSpinner}></span>}
                {isLoading ? 'Overwriting...' : '🔄 Upload and Overwrite'}
              </button>
              <button
                type='button'
                onClick={handleDeleteAllAndUpload}
                className={styles.deleteAllButton}
              >
                Delete All & Upload
              </button>
            </div>
          </div>
        )}

        {message && duplicateWarning.length === 0 && (
          <div
            className={`${styles.message} ${
              message.includes('failed') || message.includes('error')
                ? styles.messageError
                : styles.messageSuccess
            }`}
          >
            {message}
          </div>
        )}

        {uploadSuccess && (
          <div className={styles.successActions}>
            {createdProjectId ? (
              <Link
                href={`/${createdProjectId}`}
                className={styles.viewPanoramasButton}
              >
                🏠 View Project Panoramas
              </Link>
            ) : (
              <Link href='/' className={styles.viewPanoramasButton}>
                🏠 View Panoramas
              </Link>
            )}
          </div>
        )}

        {/* Diagnostics Section */}
        {(message.includes('failed') ||
          message.includes('error') ||
          validationErrors.length > 0) && (
          <div className={styles.diagnosticsSection}>
            <button
              type='button'
              onClick={runDiagnostics}
              disabled={loadingDiagnostics}
              className={styles.diagnosticsButton}
            >
              {loadingDiagnostics
                ? '🔍 Running Diagnostics...'
                : '🔧 Run System Diagnostics'}
            </button>
            <p className={styles.diagnosticsHint}>
              Having trouble? Run diagnostics to check your system setup.
            </p>
          </div>
        )}

        {/* Diagnostics Results */}
        {showDiagnostics && diagnosticsData && (
          <div
            className={`${styles.message} ${diagnosticsData.healthy ? styles.messageSuccess : styles.messageError}`}
          >
            <div className={styles.diagnosticsHeader}>
              <h4>
                {diagnosticsData.healthy
                  ? '✅ System Check Passed'
                  : '❌ System Issues Detected'}
              </h4>
              <button
                type='button'
                onClick={() => setShowDiagnostics(false)}
                className={styles.toggleButton}
              >
                ✕ Close
              </button>
            </div>

            {diagnosticsData.error ? (
              <p>{diagnosticsData.error}</p>
            ) : (
              <div className={styles.diagnosticsResults}>
                <div className={styles.diagnosticsSummary}>
                  <h5>📋 System Status:</h5>
                  <ul>
                    <li>
                      Python: {diagnosticsData.summary?.python || '❓ Unknown'}
                    </li>
                    <li>
                      NumPy: {diagnosticsData.summary?.numpy || '❓ Unknown'}
                    </li>
                    <li>
                      Public Directory:{' '}
                      {diagnosticsData.summary?.publicDir || '❓ Unknown'}
                    </li>
                    <li>
                      Scripts:{' '}
                      {diagnosticsData.summary?.scripts || '❓ Unknown'}
                    </li>
                  </ul>
                </div>

                {diagnosticsData.diagnostics?.recommendations?.length > 0 && (
                  <div className={styles.diagnosticsRecommendations}>
                    <h5>💡 Recommendations:</h5>
                    <ul>
                      {diagnosticsData.diagnostics.recommendations.map(
                        (rec: string, index: number) => (
                          <li key={index}>{rec}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {process.env.NODE_ENV === 'development' && (
                  <details className={styles.diagnosticsDetails}>
                    <summary>🔍 Technical Details</summary>
                    <pre>
                      {JSON.stringify(diagnosticsData.diagnostics, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        )}

        <div className={styles.instructions}>
          <h3 className={styles.instructionsTitle}>Instructions:</h3>
          <ol className={styles.instructionsList}>
            <li>
              Select your pano-poses.csv file containing panorama position data
            </li>
            <li>Select one or more panorama images (JPG or PNG format)</li>
            <li>
              Click "Upload and Generate" to upload files and automatically
              generate the configuration
            </li>
            <li>
              Once complete, return to the main viewer to see your panoramas
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
