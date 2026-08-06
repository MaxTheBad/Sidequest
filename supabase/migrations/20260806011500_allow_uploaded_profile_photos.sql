alter table public.profiles
  drop constraint if exists profiles_avatar_capture_method_check;

alter table public.profiles
  add constraint profiles_avatar_capture_method_check
  check (avatar_capture_method is null or avatar_capture_method in ('camera', 'upload'));
