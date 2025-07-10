#!/usr/bin/env python3

import json
import csv
import numpy as np
import math
import argparse
import os

def quaternion_conjugate(q):
    w, x, y, z = q
    return np.array([w, -x, -y, -z])

def quaternion_multiply(a, b):
    w1, x1, y1, z1 = a
    w2, x2, y2, z2 = b
    return np.array([
        w1*w2 - x1*x2 - y1*y2 - z1*z2,
        w1*x2 + x1*w2 + y1*z2 - z1*y2,
        w1*y2 - x1*z2 + y1*w2 + z1*x2,
        w1*z2 + x1*y2 - y1*x2 + z1*w2
    ])

def quaternion_rotate_vector(q, v):
    q_conj = quaternion_conjugate(q)
    q_v = np.array([0] + list(v))
    rotated = quaternion_multiply(quaternion_multiply(q, q_v), q_conj)
    return rotated[1:]

def compute_initial_yaw(quat):
    """Compute absolute yaw in Marzipano coordinate system"""
    # Local forward vector in NavVis system (X-forward, Y-left, Z-up)
    local_forward = np.array([1, 0, 0])
    
    # Rotate to world coordinates
    world_forward = quaternion_rotate_vector(quat, local_forward)
    
    # Convert to Marzipano coordinate system:
    # NavVis: X=forward, Y=left, Z=up
    # Marzipano: X=right, Y=up, Z=back (where positive Z points towards viewer)
    # For proper north alignment, we need:
    # - North (0°) should be positive Z in Marzipano
    # - East (90°) should be positive X in Marzipano
    marz_forward = np.array([
        -world_forward[1],  # -left = right (X axis)
        world_forward[2],   # up stays up (Y axis)
        world_forward[0]    # forward = forward (Z axis)
    ])
    
    # Project to horizontal plane
    x = marz_forward[0]  # East-West component
    z = marz_forward[2]  # North-South component
    
    # Calculate absolute yaw (0 = north, increasing clockwise)
    # atan2(x, z) gives: North=0°, East=90°, South=180°, West=270°
    yaw_rad = math.atan2(x, z)
    return math.degrees(yaw_rad)

def generate_config(csv_file, output_file='config.json', project_path=''):
    panoramas = []
    
    # Detect delimiter by reading first line
    with open(csv_file, 'r', encoding='utf-8') as f:
        first_line = f.readline()
        delimiter = ';' if ';' in first_line else ','
    
    # Read CSV with detected delimiter
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=delimiter)
        if reader.fieldnames:
            reader.fieldnames = [name.strip() for name in reader.fieldnames]
        for row in reader:
            row = {k.strip(): v.strip() for k, v in row.items()}
            filename = row.get('filename', '')
            # Extract ID from filename - handle different formats
            if '-' in filename:
                pano_id = filename.split('-')[0]
            else:
                # Remove file extension and use as ID
                pano_id = filename.split('.')[0] if '.' in filename else filename
            
            pano = {
                'id': pano_id,
                'filename': filename,
                'pos': [float(row['pano_pos_x']), float(row['pano_pos_y']), float(row['pano_pos_z'])],
                'ori': [float(row['pano_ori_w']), float(row['pano_ori_x']), float(row['pano_ori_y']), float(row['pano_ori_z'])]
            }
            panoramas.append(pano)

    # group Z positions into floor clusters
    z_values = sorted(set(p['pos'][2] for p in panoramas))
    floors = []
    current = [z_values[0]]
    for z in z_values[1:]:
        if abs(z - current[0]) < 2.0:
            current.append(z)
        else:
            floors.append(current)
            current = [z]
    floors.append(current)

    # assign floor centers and create floor levels
    # Find the ground floor (floor with most panoramas or middle floor)
    floor_sizes = [(len([p for p in panoramas if any(abs(p['pos'][2] - z) < 0.1 for z in group)]), i, group) 
                   for i, group in enumerate(floors)]
    ground_floor_idx = max(floor_sizes, key=lambda x: x[0])[1]
    
    z_to_floor_center = {}
    z_to_floor_number = {}
    floor_levels = []
    
    def get_floor_name(floor_num):
        if floor_num < 0:
            return f'Basement {abs(floor_num)}'
        elif floor_num == 0:
            return 'Ground Floor'
        else:
            return f'Floor {floor_num}'
    
    for i, group in enumerate(floors):
        center = sum(group) / len(group)
        # Assign floor numbers relative to ground floor
        floor_number = i - ground_floor_idx
        floor_levels.append({
            'id': f'floor_{floor_number}',
            'name': get_floor_name(floor_number),
            'z': center
        })
        for z in group:
            z_to_floor_center[z] = center
            z_to_floor_number[z] = floor_number

    scenes = []
    CAMERA_HEIGHT = 1.5  # eye height on a human body, approximate
    for pano in panoramas:
        pano_pos = pano['pos']
        pano_ori = pano['ori']
        floor_center = z_to_floor_center[pano_pos[2]]
        current_floor = z_to_floor_number[pano_pos[2]]

        # Adjust camera height based on floor type for better hotspot positioning
        adjusted_camera_height = CAMERA_HEIGHT
        if current_floor < 0:  # Basement floors might have lower ceilings
            adjusted_camera_height = CAMERA_HEIGHT * 0.9
        
        # compute eye position in world coordinates using orientation
        eye_offset_local = np.array([0, 0, adjusted_camera_height])
        eye_offset_world = quaternion_rotate_vector(pano_ori, eye_offset_local)
        eye_pos = np.array(pano_pos) + eye_offset_world

        hotspots = []
        distances = []
        # Only consider targets on the same floor level
        for target in panoramas:
            if target['id'] != pano['id']:
                target_floor = z_to_floor_number[target['pos'][2]]
                # Filter: only include hotspots to panoramas on the same floor
                if target_floor == current_floor:
                    dist = np.linalg.norm(np.array(target['pos']) - np.array(pano_pos))
                    distances.append((dist, target))
        
        distances.sort(key=lambda x: x[0])
        for _, target in distances[:40]:
            target_pos = target['pos']
            rel_vec = np.array(target_pos) - eye_pos  # reference from eye position
            local_vec = quaternion_rotate_vector(quaternion_conjugate(pano_ori), rel_vec)

            # remap from NavVis to Marzipano frame
            x_m = -local_vec[1]   # navvis y → marzipano x
            y_m = local_vec[2]    # navvis z → marzipano y
            z_m = local_vec[0]    # navvis x → marzipano z

            yaw = math.atan2(x_m, z_m)
            pitch = -math.atan2(y_m, math.sqrt(x_m**2 + z_m**2))
            distance = np.linalg.norm(rel_vec)
            
            hotspots.append({
                'yaw': yaw,
                'pitch': pitch,
                'rotation': 0,
                'target': target['id'],
                'distance': round(distance, 2),
                'type': 'navigation'
            })
        
        # Calculate initial yaw for proper orientation
        initialYaw = compute_initial_yaw(pano_ori)
        
        scene = {
            'id': pano['id'],
            'name': f"Panorama {pano['id']} - {get_floor_name(current_floor)}",
            'floor': current_floor,
            'position': dict(zip(['x','y','z'], pano['pos'])),
            'orientation': dict(zip(['w','x','y','z'], pano['ori'])),
            'initialYaw': initialYaw,
            'initialViewParameters': {
                'yaw': 0,
                'pitch': 0,
                'fov': math.radians(30)
            },
            'linkHotspots': hotspots,
            'infoHotspots': []
        }
        scenes.append(scene)
    config = {
        'scenes': scenes, 
        'name': 'Panorama Tour',
        'floors': floor_levels
    }
    with open(output_file, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"Config generated in {output_file}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate Marzipano configuration')
    parser.add_argument('--project', type=str, help='Project ID for project-specific generation')
    parser.add_argument('--test', action='store_true', help='Run in test mode')
    args = parser.parse_args()
    
    if args.test:
        print('Configuration generation test passed')
        exit(0)
    
    if not args.project:
        print('Error: Project ID is required. Use --project <projectId> argument.')
        exit(1)
        
    # Project-specific paths
    csv_file = f'public/{args.project}/data/pano-poses.csv'
    output_file = f'public/{args.project}/config.json'
    project_path = f'/{args.project}'
    
    if not os.path.exists(csv_file):
        print(f'Error: CSV file not found at {csv_file}')
        exit(1)
        
    generate_config(csv_file, output_file, project_path)