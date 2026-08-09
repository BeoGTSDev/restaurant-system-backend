// Middleware: checks or prepares a request before its controller runs.
const multer = require('multer');
const path = require('path');
const fs = require('fs');


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
        cb(null, file.fieldname + '-' + uniqueSuffix + extensions[file.mimetype]);
    }
});

// Request check: runs the file filter step. It calls next() only when the request may continue.
const fileFilter = (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Not an image! Please upload an image.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1024 * 1024 * 10
    }
});

module.exports = upload;

// Request check: runs the valid signature step. It calls next() only when the request may continue.
const validSignature = (buffer, mimetype) => {
    if (mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (mimetype === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    if (mimetype === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
    return false;
};

upload.validateImageSignature = (req, res, next) => {
    if (!req.file) return next();
    try {
        const header = Buffer.alloc(12);
        const descriptor = fs.openSync(req.file.path, 'r');
        fs.readSync(descriptor, header, 0, 12, 0);
        fs.closeSync(descriptor);
        if (!validSignature(header, req.file.mimetype)) {
            fs.unlinkSync(req.file.path);
            req.file = null;
            return next(Object.assign(new Error('Uploaded file content is not a valid image.'), { status: 400 }));
        }
        next();
    } catch (error) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        next(Object.assign(new Error('Unable to validate uploaded image.'), { status: 400 }));
    }
};
