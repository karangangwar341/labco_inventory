'use client';

import React, { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { administrationService } from '../administration.service';
import { queryKeys } from '@/lib/query/query-keys';

interface BulkProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BulkProjectsModal({ isOpen, onClose }: BulkProjectsModalProps) {
  const queryClient = useQueryClient();
  const [projectsText, setProjectsText] = useState(
    `Apex Central Diagnostics Lab\nMetropolis Healthcare Center\nCity Hospital Central Diagnostic Unit\nValley General Clinical Pathology`
  );
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load warehouses for optional initial warehouse assignment
  const { data: warehouses = [] } = useQuery({
    queryKey: queryKeys.administration.warehouses(),
    queryFn: administrationService.getWarehouses,
    enabled: isOpen,
  });

  const parsedProjects = useMemo(() => {
    return projectsText
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^["']|["']$/g, ''))
      .filter((l) => l.length > 0);
  }, [projectsText]);

  const bulkCreateMutation = useMutation({
    mutationFn: administrationService.createBulkProjects,
    onSuccess: async (res) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.administration.projects() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.administration.warehouses() }),
      ]);
      setStatusMessage(
        `Successfully created ${res.totalCreated} projects! ${
          res.totalSkipped > 0 ? `(${res.totalSkipped} already existed)` : ''
        }`
      );
      setProjectsText('');
    },
    onError: (err: unknown) => {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to bulk create projects.');
    },
  });

  const handleSubmit = () => {
    if (parsedProjects.length === 0) return;
    setErrorMessage(null);
    setStatusMessage(null);

    const items = parsedProjects.map((name) => ({
      name,
      warehouseIds: selectedWarehouseId ? [selectedWarehouseId] : undefined,
    }));

    bulkCreateMutation.mutate(items);
  };

  const isBusy = bulkCreateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="⚡ Bulk Create Project Organizations"
      description="Create multiple healthcare diagnostic projects or lab accounts simultaneously into the database."
      
    >
      <div className="space-y-4">
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 font-medium">
            ✓ {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 font-medium">
            ⚠️ {errorMessage}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">
            Project Organization Names (One per line):
          </label>
          <textarea
            rows={6}
            value={projectsText}
            onChange={(e) => setProjectsText(e.target.value)}
            placeholder={`Apex Central Diagnostics Lab\nMetropolis Healthcare Center\nCity Hospital Clinical Pathology`}
            className="w-full text-xs font-mono p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {warehouses.length > 0 && (
          <div className="space-y-1 p-3 bg-slate-50 border border-slate-200 rounded-md">
            <label className="text-xs font-semibold text-slate-700">
              Optional: Assign Default Warehouse to all created projects:
            </label>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full text-xs rounded border-slate-300 py-1.5 px-3 bg-white font-medium text-slate-800"
            >
              <option value="">No immediate warehouse linkage (assign later)</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} {wh.locationDescription ? `(${wh.locationDescription})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {parsedProjects.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-700">
              Preview ({parsedProjects.length} Projects):
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-md">
              {parsedProjects.map((p, i) => (
                <Badge key={i} variant="neutral" size="sm">
                  🏢 {p}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
          <Button variant="secondary" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={parsedProjects.length === 0 || isBusy}
          >
            {isBusy ? 'Creating Projects...' : `⚡ Create ${parsedProjects.length} Projects`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
