import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () => {
  return json(
    {
      error:
        'Local vision endpoint is disabled. Configure PUBLIC_IMAGE_DESCRIBER_URL to point to the dockerized image-describer service.',
    },
    { status: 410 },
  );
};
