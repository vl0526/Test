export const t = {
    header: {
        title: 'TURBO AUDIO BATCH',
        description: 'Hệ thống Render đa luồng hiệu suất cao. Xử lý Pitch, Speed và Smart Trim trong thời gian thực.'
    },
    fileUpload: {
        audioTitle: 'Hàng Đợi Đầu Vào (Input Queue)',
        audioDescription: 'Kéo thả thư mục hoặc chọn nhiều file để khởi tạo hàng chờ.',
        selectFolder: 'Nhập cả thư mục',
        selectFile: 'Thêm tệp lẻ',
        selectedFiles: (count: number) => `Queue sãn sàng: ${count} items.`
    },
    configuration: {
        title: 'Thông số Kỹ thuật (Parameters)',
        pitch: 'Dịch Cao Độ (Semitone)',
        speed: 'Tốc độ (Playback Rate)',
        durationMode: 'Chế độ thời lượng',
        durationKeep: 'Giữ nguyên gốc (Stretch)',
        durationTruncate: 'Cắt theo SRT',
        soundOptimization: 'Smart Silence Removal (AI Gate)',
        soundOptimizationTooltip: 'Tự động loại bỏ Dead Air ở đầu/cuối track (Threshold -50dB).'
    },
    process: {
        title: 'Control Center',
        description: 'Kích hoạt Engine xử lý song song.',
        button: 'KHỞI CHẠY (START ENGINE)',
        processing: 'ĐANG XỬ LÝ SONG SONG...'
    },
    results: {
        complete: 'HOÀN TẤT CHIẾN DỊCH',
        completeWithErrors: 'HOÀN TẤT (CÓ CẢNH BÁO)',
        downloadButton: 'TẢI GÓI ZIP',
        downloadError: 'Không có dữ liệu đầu ra.'
    },
    errors: {
        title: 'Logs hệ thống:',
        generic: 'Lỗi Runtime.',
        noFiles: 'Hàng đợi trống.',
        lamejsNotFound: 'Core MP3 Encoder chưa load.',
        jszipNotFound: 'Core Zipper chưa load.'
    },
    progress: {
        initializing: 'Booting System...',
        processingFile: (current: number, total: number, name: string) => `Processing: ${name}`,
        encoding: 'Encoding...',
        finalizing: 'Finalizing Output...'
    }
};