import React, { useState, useEffect } from 'react';
import { ProcessReport } from '../types';
import { DownloadIcon, CheckCircleIcon, WarningIcon } from './Icons';
import { t } from '../localization/vi';

interface ResultsDisplayProps {
    zipBlob: Blob | null;
    report: ProcessReport | null;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ zipBlob, report }) => {
    const [downloadUrl, setDownloadUrl] = useState<string>('');

    useEffect(() => {
        if (zipBlob) {
            const url = URL.createObjectURL(zipBlob);
            setDownloadUrl(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [zipBlob]);

    if (!report) return null;

    const hasErrors = report.errors.length > 0;

    return (
        <div className="bg-[var(--bg-secondary)] rounded-lg p-6 shadow-lg border border-[var(--border-color)] mt-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
                {hasErrors ? <WarningIcon className="text-[var(--warning-color)] h-8 w-8"/> : <CheckCircleIcon className="text-[var(--success-color)] h-8 w-8"/>}
                <h2 className={`text-2xl font-bold ${hasErrors ? 'text-[var(--warning-color)]' : 'text-[var(--success-color)]'}`}>
                    {hasErrors ? t.results.completeWithErrors : t.results.complete}
                </h2>
            </div>
            
            <div className="bg-[var(--bg-primary)] p-4 rounded mb-6 text-sm font-mono max-h-40 overflow-y-auto border border-[var(--border-color)]">
                <p className="font-bold text-[var(--accent-color)] mb-2">Thống kê:</p>
                <p>Tổng số file: {report.totalFiles}</p>
                <p>Thành công: <span className="text-[var(--success-color)]">{report.successCount}</span></p>
                {hasErrors && (
                    <div className="mt-2 pt-2 border-t border-[var(--border-color)]">
                        <p className="text-[var(--error-text)] font-bold">Lỗi:</p>
                        {report.errors.map((e, i) => <p key={i} className="text-[var(--error-text)]">- {e}</p>)}
                    </div>
                )}
            </div>

            {zipBlob && downloadUrl ? (
                <a
                    href={downloadUrl}
                    download="processed_audio_files.zip"
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 text-lg font-bold text-[var(--success-text-color)] bg-[var(--success-bg)] rounded-md shadow-lg transition-all duration-300 ease-in-out hover:bg-[var(--success-bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--success-bg)] focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]"
                >
                    <DownloadIcon className="h-6 w-6"/>
                    {t.results.downloadButton} ({(zipBlob.size / 1024 / 1024).toFixed(2)} MB)
                </a>
            ) : (
                <p className="text-[var(--error-text)]">{t.results.downloadError}</p>
            )}
        </div>
    );
};