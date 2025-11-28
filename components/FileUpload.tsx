import React, { useRef, ChangeEvent } from 'react';
import { UploadIcon, FolderIcon } from './Icons';
import { t } from '../localization/vi';

interface FileUploadProps {
    id: string;
    title: string;
    description: string;
    onFileUpload: (files: FileList | null) => void;
    accept?: string;
    directory?: boolean;
    multiple?: boolean;
    fileName?: string;
    fileCount?: number;
}

export const FileUpload: React.FC<FileUploadProps> = ({
    id,
    title,
    description,
    onFileUpload,
    accept,
    directory = false,
    multiple = false,
    fileName,
    fileCount
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        onFileUpload(e.target.files);
        // Reset input value to allow re-uploading the same file/folder
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    const handleButtonClick = () => {
        inputRef.current?.click();
    };

    const inputProps: { [key: string]: any } = {};
    if (directory) {
        inputProps.webkitdirectory = "true";
        inputProps.directory = "true";
    }

    return (
        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 shadow-lg border border-[var(--border-color)] h-full flex flex-col justify-between">
            <div>
                <h2 className="text-xl font-bold text-[var(--accent-color)] mb-2">{title}</h2>
                <p className="text-[var(--text-secondary)] mb-4 text-sm">{description}</p>
            </div>
            <div className="mt-4">
                 <input
                    type="file"
                    id={id}
                    ref={inputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept={accept}
                    multiple={multiple}
                    {...inputProps}
                />
                <button
                    onClick={handleButtonClick}
                    className="w-full bg-[var(--input-bg)] hover:bg-[var(--input-bg-hover)] text-[var(--text-tertiary)] font-bold py-3 px-4 rounded-md transition-colors duration-200 flex items-center justify-center gap-2"
                >
                   {directory ? <FolderIcon className="w-5 h-5" /> : <UploadIcon className="w-5 h-5" />}
                   <span>{directory ? t.fileUpload.selectFolder : t.fileUpload.selectFile}</span>
                </button>
                {fileName && (
                     <div className="mt-3 text-sm text-[var(--success-color)] truncate text-center">
                        {t.fileUpload.selectedFile} <span className="font-medium">{fileName}</span>
                    </div>
                )}
                 {fileCount !== undefined && fileCount > 0 && (
                     <div className="mt-3 text-sm text-[var(--success-color)] text-center">
                        {t.fileUpload.selectedFiles(fileCount)}
                    </div>
                )}
            </div>
        </div>
    );
};
