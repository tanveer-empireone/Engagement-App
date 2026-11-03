# Google Drive and Google Sheets storage

The production app stores structured application data in dedicated tabs of a Google Sheet and uploads new media directly to Google Drive. Vercel environment variables hold credentials; credentials are never written into the Sheet.

## Google Cloud setup

1. Enable the **Google Drive API** and **Google Sheets API** in one Google Cloud project.
2. Create a service account and generate a JSON key.
3. Give that identity edit access to the state spreadsheet.
4. Configure Drive using one of these supported arrangements:
   - **Shared drive:** add the service account as a member with permission to add files, and use a folder in that shared drive as the app's Drive root.
   - **My Drive:** enable domain-wide delegation for the service account, authorize the Drive and Sheets scopes in Google Workspace Admin, and impersonate the Workspace user who owns the root folder.

Service accounts cannot own files in My Drive without impersonating a Workspace user. A shared drive is the simpler long-term arrangement because its files belong to the organization.

## Vercel environment variables

Set these for Production and Preview:

```text
GOOGLE_STATE_SPREADSHEET_ID=<spreadsheet ID>
GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email from the service-account JSON>
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<private_key from the service-account JSON>
GOOGLE_WORKSPACE_IMPERSONATED_USER=<Workspace user email; required for a My Drive root>
CLICKUP_API_TOKEN=<ClickUp token, when ClickUp sync is enabled>
```

`GOOGLE_WORKSPACE_IMPERSONATED_USER` can be omitted when the service account writes into a shared drive and directly has access to the spreadsheet.

The first successful request creates these tabs without changing existing spreadsheet tabs:

- `App_People`
- `App_Config`
- `App_Uploads`
- `App_Directions`
- `App_ShiftReports`
- `App_Activities`
- `App_Settings`
- `App_DrivePermissions`
- `App_SyncLedger`
- `App_SyncLogs`

## One-time migration from Vercel Blob

Keep `BLOB_READ_WRITE_TOKEN` attached for the first deployment. When the `App_*` tabs are empty, the app imports the existing Blob state and copies referenced legacy media into Google Drive before writing the Sheet.

After deployment, open `/api/server/health`. A completed migration reports:

```json
{
  "status": "ok",
  "storage": "google-sheets-drive",
  "legacyMediaCount": 0
}
```

After confirming the roster, permissions, activities, reports, and uploads in the app, remove the Vercel Blob integration and `BLOB_READ_WRITE_TOKEN`, then redeploy. New state and media writes do not use Blob.
