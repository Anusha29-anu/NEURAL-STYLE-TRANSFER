import * as tf from '@tensorflow/tfjs';

const MODEL_URL = 'https://tfhub.dev/google/magenta/arbitrary-image-stylization-v1-256/tfjs_graph_model/model.json';

let model;
const contentImagePreview = document.getElementById('content-image-preview');
const styleImagePreview = document.getElementById('style-image-preview');
const contentImageInput = document.getElementById('content-image-input');
const styleImageInput = document.getElementById('style-image-input');
const transferButton = document.getElementById('transfer-button');
const outputImageElement = document.getElementById('output-image');
const statusElement = document.getElementById('status');
const outputPlaceholderText = document.getElementById('output-placeholder-text');

// Default images (paths relative to index.html)
const defaultContentImgSrc = 'content-default.png';
const defaultStyleImgSrc = 'style-default.png';

async function setup() {
    statusElement.textContent = 'Loading TensorFlow.js backend...';
    try {
        await tf.setBackend('webgl');
        await tf.ready();
        statusElement.textContent = 'TensorFlow.js backend ready. Loading style transfer model...';

        model = await tf.loadGraphModel(MODEL_URL);

        statusElement.textContent = 'Model loaded. Ready to transfer style!';
        transferButton.disabled = false;
        console.log('Model loaded successfully');

        // Ensure default images are loaded, or display error for them
        checkImageLoad(contentImagePreview, "Default content image");
        checkImageLoad(styleImagePreview, "Default style image");

    } catch (e) {
        console.error('Initialization or Model loading failed:', e);
        statusElement.textContent = `Error: ${e.message}. Check console.`;
        if (e.message.toLowerCase().includes('webgl')) {
            statusElement.textContent += ' Your browser might not support WebGL or it is disabled.';
        }
    }
}

function checkImageLoad(imgElement, imageName) {
    if (imgElement.complete && imgElement.naturalHeight !== 0) {
        // Image loaded fine
    } else {
        // Image failed to load (could be a 404 if default images aren't there)
        imgElement.alt = `${imageName} (failed to load)`;
        if (imgElement.src.includes('default.png')) { // Only show this status for default images
            statusElement.textContent = `Warning: ${imageName} could not be loaded. Please upload one.`;
        }
    }
}

function loadImagePreview(event, previewElement) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewElement.src = e.target.result;
            previewElement.onload = () => checkImageLoad(previewElement, "Uploaded image");
        }
        reader.readAsDataURL(file);
    }
}

contentImageInput.addEventListener('change', (e) => loadImagePreview(e, contentImagePreview));
styleImageInput.addEventListener('change', (e) => loadImagePreview(e, styleImagePreview));

function preprocessImage(imageElement) {
    // Preprocess the image:
    // 1. Convert to a tensor
    // 2. Normalize pixel values to [0, 1]
    // 3. Add a batch dimension
    return tf.tidy(() => {
        let tensor = tf.browser.fromPixels(imageElement).toFloat();
        tensor = tensor.div(tf.scalar(255));
        return tensor.expandDims(0);
    });
}

transferButton.addEventListener('click', async() => {
    if (!model) {
        statusElement.textContent = 'Model is not loaded yet. Please wait or refresh.';
        return;
    }

    if (!contentImagePreview.complete || contentImagePreview.naturalWidth === 0 ||
        !styleImagePreview.complete || styleImagePreview.naturalWidth === 0) {
        statusElement.textContent = 'Please ensure both content and style images are properly loaded before transferring.';
        return;
    }

    statusElement.textContent = 'Processing... This may take a few moments.';
    transferButton.disabled = true;
    outputImageElement.src = "#"; // Clear previous output
    outputPlaceholderText.style.display = 'block';


    try {
        await tf.nextFrame(); // Allow UI to update before heavy computation

        const contentTensor = preprocessImage(contentImagePreview);
        const styleTensor = preprocessImage(styleImagePreview);

        console.log('Content tensor shape:', contentTensor.shape);
        console.log('Style tensor shape:', styleTensor.shape);

        const startTime = performance.now();

        // The Magenta model expects an array of two tensors: [content_image, style_image]
        // It returns a single tensor representing the stylized image.
        const resultTensor = model.execute([contentTensor, styleTensor]);

        const endTime = performance.now();
        statusElement.textContent = `Stylization complete! Took ${((endTime - startTime) / 1000).toFixed(2)} seconds.`;

        // Postprocess the output tensor:
        // 1. Squeeze the batch dimension
        // 2. Convert tensor to image data and display on canvas/img
        const reshapedTensor = resultTensor.squeeze([0]); // Shape [H, W, 3]

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = reshapedTensor.shape[1]; // width
        tempCanvas.height = reshapedTensor.shape[0]; // height
        await tf.browser.toPixels(reshapedTensor, tempCanvas);

        outputImageElement.src = tempCanvas.toDataURL('image/png');
        outputPlaceholderText.style.display = 'none';

        // Dispose of tensors to free up WebGL memory
        contentTensor.dispose();
        styleTensor.dispose();
        if (Array.isArray(resultTensor)) { // Should be a single tensor for this model
            resultTensor.forEach(t => t.dispose());
        } else {
            resultTensor.dispose();
        }
        reshapedTensor.dispose();

        console.log('Tensors disposed. TF Memory:', tf.memory());

    } catch (e) {
        console.error('Error during style transfer:', e);
        statusElement.textContent = `Error during style transfer: ${e.message}. Check console.`;
        if (e.message.toLowerCase().includes("webgl")) {
            statusElement.textContent += ' A WebGL/GPU issue might have occurred. Try refreshing.';
        }
    } finally {
        transferButton.disabled = false;
    }
});

// Initialize
contentImagePreview.src = defaultContentImgSrc;
styleImagePreview.src = defaultStyleImgSrc;
outputImageElement.src = '#';
outputPlaceholderText.style.display = 'block';

// Set up event listeners for default image loading (or failure)
contentImagePreview.onload = () => checkImageLoad(contentImagePreview, "Default content image");
contentImagePreview.onerror = () => checkImageLoad(contentImagePreview, "Default content image");
styleImagePreview.onload = () => checkImageLoad(styleImagePreview, "Default style image");
styleImagePreview.onerror = () => checkImageLoad(styleImagePreview, "Default style image");


setup();