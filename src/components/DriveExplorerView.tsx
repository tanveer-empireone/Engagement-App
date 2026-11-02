import React from 'react';
import { LibraryView } from './LibraryView';

/**
 * DriveExplorerView is unified into Media Library (LibraryView).
 * Retained as a backwards-compatible component.
 */
export const DriveExplorerView: React.FC = () => {
  return <LibraryView />;
};
