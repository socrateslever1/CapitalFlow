DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;
DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;

CREATE POLICY avatars_owner_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    (
      (storage.foldername(storage.objects.name))[1] = 'profiles'
      AND (storage.foldername(storage.objects.name))[2] IN (
        SELECT id::text FROM public.get_accessible_ids()
      )
    )
    OR
    (
      (storage.foldername(storage.objects.name))[1] = 'clientes'
      AND EXISTS (
        SELECT 1
        FROM public.clientes AS client
        WHERE client.id::text = (storage.foldername(storage.objects.name))[2]
          AND client.owner_id IN (SELECT id FROM public.get_accessible_ids())
      )
    )
  )
);

CREATE POLICY avatars_owner_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (
      (storage.foldername(storage.objects.name))[1] = 'profiles'
      AND (storage.foldername(storage.objects.name))[2] IN (
        SELECT id::text FROM public.get_accessible_ids()
      )
    )
    OR
    (
      (storage.foldername(storage.objects.name))[1] = 'clientes'
      AND EXISTS (
        SELECT 1
        FROM public.clientes AS client
        WHERE client.id::text = (storage.foldername(storage.objects.name))[2]
          AND client.owner_id IN (SELECT id FROM public.get_accessible_ids())
      )
    )
  )
)
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    (
      (storage.foldername(storage.objects.name))[1] = 'profiles'
      AND (storage.foldername(storage.objects.name))[2] IN (
        SELECT id::text FROM public.get_accessible_ids()
      )
    )
    OR
    (
      (storage.foldername(storage.objects.name))[1] = 'clientes'
      AND EXISTS (
        SELECT 1
        FROM public.clientes AS client
        WHERE client.id::text = (storage.foldername(storage.objects.name))[2]
          AND client.owner_id IN (SELECT id FROM public.get_accessible_ids())
      )
    )
  )
);

CREATE POLICY avatars_owner_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (
      (storage.foldername(storage.objects.name))[1] = 'profiles'
      AND (storage.foldername(storage.objects.name))[2] IN (
        SELECT id::text FROM public.get_accessible_ids()
      )
    )
    OR
    (
      (storage.foldername(storage.objects.name))[1] = 'clientes'
      AND EXISTS (
        SELECT 1
        FROM public.clientes AS client
        WHERE client.id::text = (storage.foldername(storage.objects.name))[2]
          AND client.owner_id IN (SELECT id FROM public.get_accessible_ids())
      )
    )
  )
);
