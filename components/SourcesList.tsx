import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { GroundingChunk } from '../types';

interface SourcesListProps {
  chunks?: GroundingChunk[];
}

const SourcesList: React.FC<SourcesListProps> = ({ chunks }) => {
  if (!chunks || chunks.length === 0) return null;

  // Deduplicate sources based on URL
  const uniqueChunks = chunks.reduce((acc, current) => {
    const uri = current.web?.uri;
    if (uri && !acc.find(item => item.web?.uri === uri)) {
      acc.push(current);
    }
    return acc;
  }, [] as GroundingChunk[]);

  return (
    <div className="mt-8 pt-6 border-t border-slate-200">
      <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Globe className="w-4 h-4" />
        Bronnen & Verificatie
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {uniqueChunks.map((chunk, index) => {
          if (!chunk.web) return null;
          return (
            <a
              key={index}
              href={chunk.web.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start p-3 bg-white border border-slate-200 rounded-lg hover:border-blue-400 hover:shadow-sm transition-all group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                  {chunk.web.title}
                </p>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  {new URL(chunk.web.uri).hostname}
                </p>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-300 ml-2 flex-shrink-0 group-hover:text-blue-500" />
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default SourcesList;
