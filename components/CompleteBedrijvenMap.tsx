import React, { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Globe, Building } from 'lucide-react';

interface Bedrijf {
  bedrijfsnaam: string;
  adres: string;
  stad: string;
  telefoon: string;
  email: string;
  website: string;
  kvk: string;
}

export const CompleteBedrijvenMap: React.FC = () => {
  const [bedrijven, setBedrijven] = useState<Bedrijf[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  useEffect(() => {
    // Load complete bedrijven data
    fetch('bedrijven_complete.json')
      .then(r => r.json())
      .then(data => {
        setBedrijven(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading bedrijven:', err);
        setLoading(false);
      });
  }, []);

  const filtered = bedrijven.filter(b => {
    const query = search.toLowerCase();
    return (
      b.bedrijfsnaam.toLowerCase().includes(query) ||
      b.adres.toLowerCase().includes(query) ||
      b.stad.toLowerCase().includes(query)
    );
  });

  const jongeneel = filtered.filter(b => b.bedrijfsnaam.includes('Jongeneel'));
  const overige = filtered.filter(b => !b.bedrijfsnaam.includes('Jongeneel'));

  return (
    <div className="w-full h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-4">
        <h2 className="text-2xl font-bold mb-2">📍 Alle Bedrijven - Compleet</h2>
        <input
          type="text"
          placeholder="Zoek bedrijf, adres, plaats..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-96">
          <p className="text-gray-500">Laden...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 h-[calc(100%-120px)] overflow-y-auto">
          {/* Jongeneel Section */}
          {jongeneel.length > 0 && (
            <div className="md:col-span-2 mb-4">
              <h3 className="text-lg font-bold mb-3 text-green-600">🏢 Jongeneel ({jongeneel.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {jongeneel.map((b, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedCompany(b.bedrijfsnaam)}
                    className="bg-white p-4 rounded-lg border-l-4 border-green-500 hover:shadow-lg cursor-pointer transition"
                  >
                    <h4 className="font-bold text-gray-800">{b.bedrijfsnaam}</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      <MapPin size={14} className="inline mr-1" />
                      {b.adres}
                    </p>
                    <p className="text-sm text-gray-500">{b.stad}</p>

                    {/* Contact info */}
                    <div className="mt-3 space-y-1">
                      {b.telefoon && (
                        <p className="text-xs text-blue-600 flex items-center">
                          <Phone size={12} className="mr-1" />
                          {b.telefoon}
                        </p>
                      )}
                      {b.email && (
                        <p className="text-xs text-blue-600 flex items-center">
                          <Mail size={12} className="mr-1" />
                          {b.email}
                        </p>
                      )}
                      {b.website && (
                        <a href={b.website} target="_blank" rel="noopener noreferrer"
                           className="text-xs text-blue-600 flex items-center hover:underline">
                          <Globe size={12} className="mr-1" />
                          Website
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overige Section */}
          {overige.length > 0 && (
            <div className="md:col-span-2">
              <h3 className="text-lg font-bold mb-3 text-blue-600">🏢 Overige Bedrijven ({overige.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {overige.map((b, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedCompany(b.bedrijfsnaam)}
                    className="bg-white p-4 rounded-lg border-l-4 border-blue-500 hover:shadow-lg cursor-pointer transition"
                  >
                    <h4 className="font-bold text-gray-800">{b.bedrijfsnaam}</h4>
                    <p className="text-sm text-gray-600 mt-1">
                      <MapPin size={14} className="inline mr-1" />
                      {b.adres}
                    </p>
                    <p className="text-sm text-gray-500">{b.stad}</p>

                    {/* Contact info */}
                    <div className="mt-3 space-y-1">
                      {b.telefoon && (
                        <p className="text-xs text-gray-600 flex items-center">
                          <Phone size={12} className="mr-1" />
                          {b.telefoon}
                        </p>
                      )}
                      {b.email && (
                        <p className="text-xs text-gray-600 flex items-center">
                          <Mail size={12} className="mr-1" />
                          {b.email}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div className="md:col-span-2 flex items-center justify-center h-96">
              <p className="text-gray-500">Geen bedrijven gevonden</p>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="bg-white border-t p-4 text-sm text-gray-600">
        <p>Total: {bedrijven.length} bedrijven | Jongeneel: {jongeneel.length} | Overige: {overige.length}</p>
      </div>
    </div>
  );
};

export default CompleteBedrijvenMap;
