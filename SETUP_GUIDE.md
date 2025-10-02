# Search and Redact Implementation Setup Guide

## Overview
This implementation combines Apryse WebViewer's search and redact capabilities with Azure AI Text Analytics for automated PII detection.

## Features
- **Automated PII Detection**: Uses Azure AI to identify sensitive information
- **Visual Search & Redact**: Highlights and marks PII entities for redaction
- **Backend API**: FastAPI service for PII analysis
- **Document Processing**: Supports PDF analysis and redaction

## Setup Instructions

### 1. Backend Setup

1. **Install Python dependencies**:
   ```bash
   cd c:\AI-Tribe\redaction
   uv sync
   ```

2. **Set up environment variables**:
   Create a `.env` file in the root directory:
   ```
   LANGUAGE_KEY=your_azure_language_key
   LANGUAGE_ENDPOINT=your_azure_language_endpoint
   ```

3. **Start the API server**:
   ```bash
   uv run python api.py
   ```
   The API will be available at `http://localhost:8000`

### 2. Frontend Setup

1. **Install Node.js dependencies**:
   ```bash
   cd frontend
   npm install
   ```

2. **Install Apryse WebViewer**:
   ```bash
   npm install @pdftron/webviewer
   ```

3. **Copy WebViewer files**:
   ```bash
   npx @pdftron/webviewer copy-files --source node_modules/@pdftron/webviewer/lib --destination src/lib
   ```

4. **Add license key**:
   Update the `licenseKey` in `webviewer.ts` with your Apryse license key.

5. **Start Angular development server**:
   ```bash
   ng serve
   ```
   The frontend will be available at `http://localhost:4200`

## How It Works

### 1. Search and Redact PII Button
- Extracts text from the current document
- Sends text to the backend API for PII analysis
- Automatically searches and marks detected PII entities with redaction annotations

### 2. Apply Redactions Button
- Burns in all redaction annotations to create a final redacted document
- Downloads the redacted PDF file

### 3. Backend API Endpoints

#### `POST /analyze-text`
Analyzes text content for PII entities.

**Request**:
```json
{
  "text": "The employee's SSN is 123-45-6789"
}
```

**Response**:
```json
{
  "entities": [
    {
      "text": "123-45-6789",
      "category": "USSocialSecurityNumber",
      "subcategory": "",
      "confidence_score": 0.85,
      "offset": 18,
      "length": 11
    }
  ],
  "redacted_text": "The employee's SSN is ***********"
}
```

#### `POST /analyze-pdf`
Uploads and analyzes a PDF file for PII entities.

**Request**: Multipart form data with PDF file
**Response**: Same as `/analyze-text`

## Customization Options

### 1. PII Categories
You can customize which PII categories to detect by modifying the Azure Text Analytics configuration.

### 2. Redaction Appearance
Customize redaction annotation appearance in the `searchAndRedactText` method:
- `StrokeColor`: Border color
- `FillColor`: Fill color
- `TextColor`: Overlay text color
- `OverlayText`: Text displayed over redacted content

### 3. Search Options
Modify search behavior in the `searchAndRedactText` method:
- `caseSensitive`: Case-sensitive search
- `wholeWord`: Match whole words only
- `regex`: Enable regular expressions

## Testing

1. **Load a document** with PII content (names, emails, phone numbers, SSNs)
2. **Click "Search and Redact PII"** to automatically detect and mark sensitive information
3. **Review the redaction annotations** and manually add/remove as needed
4. **Click "Apply Redactions"** to generate and download the final redacted document

## Troubleshooting

### Common Issues

1. **CORS Errors**: Ensure the backend API has proper CORS configuration for `http://localhost:4200`

2. **Azure API Errors**: Verify your Azure credentials in the `.env` file

3. **WebViewer License**: Ensure you have a valid Apryse WebViewer license

4. **Missing Dependencies**: Run `uv sync` for backend and `npm install` for frontend

### Debug Mode
Add console logging to track the PII detection process:
```typescript
console.log('Detected entities:', entities);
console.log('Search results:', results);
```

## Next Steps

### Enhancements
1. **Real-time Preview**: Show redacted text preview before applying
2. **Custom PII Rules**: Add custom pattern matching for organization-specific sensitive data
3. **Batch Processing**: Support multiple document upload and processing
4. **User Management**: Add authentication and user-specific redaction policies
5. **Audit Trail**: Log all redaction activities for compliance