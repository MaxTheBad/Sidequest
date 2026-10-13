// Add selected rows before removing deselections, so an insert failure preserves existing interests.
export async function saveUserInterests(client, userId, interestIds) {
  const ids = [...new Set(interestIds)];
  if (!userId || ids.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new Error('Choose valid interests before saving.');
  if (ids.length) {
    const { error } = await client.from('user_hobbies').upsert(ids.map((hobby_id,index) => ({user_id:userId,hobby_id,is_primary:index===0})), {onConflict:'user_id,hobby_id'});
    if (error) throw new Error(error.message || 'Could not save interests.');
  }
  let removal = client.from('user_hobbies').delete().eq('user_id',userId);
  if (ids.length) removal = removal.not('hobby_id','in',`(${ids.join(',')})`);
  const { error } = await removal;
  if (error) throw new Error(`Selected interests were saved, but old interests could not be removed: ${error.message}`);
}
