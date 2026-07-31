update public.n8n_collection_policies
set send_hours = array[send_hour]::smallint[]
where send_hour is not null
  and cardinality(send_hours) = 1
  and send_hours[1] = 9
  and send_hour <> 9;
